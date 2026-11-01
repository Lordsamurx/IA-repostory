# Arquitetura

## Requisitos

**Funcionais:** atender leads do WhatsApp numa inbox compartilhada; organizar oportunidades em funis; automatizar a entrada (chatbot), as respostas (agentes de IA) e a recuperação de leads (follow-ups e disparos); medir resultados.

**Não funcionais:**

- Instalação por pessoas não técnicas em 20 a 40 minutos.
- Custo baixo: uma VPS KVM 1 ou 2 mais o plano gratuito do Supabase.
- Uma instalação por empresa.
- Dezenas de atendentes, e não milhares.

**Restrições:** seguir o material de instalação (VPS + Supabase + domínio) e usar licença MIT.

## Visão geral

```
                    ┌──────────────────── VPS (Ubuntu 24.04) ────────────────────┐
 Navegador          │  Caddy :443 (HTTPS automático)                              │
 (atendentes) ──────┼──►  └─► app :8787  (Node, server/index.mjs)                 │
   │                │          ├─ serve a interface (dist/)                       │
   │                │          ├─ GET  /api/health                                │
   │                │          └─ POST /api/ai/reply ──► Anthropic / OpenAI       │
   │                └─────────────────────────────────────────────────────────────┘
   │  supabase-js (Auth + REST + Realtime)
   └──────────────────────────► Supabase
                                 ├─ Auth (login da equipe)
                                 ├─ Postgres: crm_records (RLS)
                                 └─ Realtime (mudanças em tempo real)
```

- **Interface:** React 19, Vite, TypeScript, Tailwind v4, Zustand, Recharts. Toda a regra de negócio vive em `src/store` e `src/lib`.
- **Servidor:** Node puro, com o SDK da Anthropic como única dependência. Guarda a chave de IA, limita as requisições e valida o token do Supabase.
- **Banco:** uma tabela `crm_records (collection, id, data jsonb)`.

## Modelo de dados

Coleções (cada item é um JSON tipado em `src/types.ts`):

| Coleção | Conteúdo |
|---|---|
| `users`, `departments` | equipe, perfis e filas |
| `contacts`, `tags`, `customFields` | leads, etiquetas e campos personalizados |
| `conversations`, `messages`, `scheduled` | atendimentos, mensagens e mensagens agendadas |
| `pipelines`, `deals`, `products`, `tasks` | funis, negócios, catálogo e tarefas |
| `agents`, `knowledge`, `chatbots`, `followUps` | automação |
| `broadcasts`, `campaigns`, `notifications` | disparos, Meta Ads e avisos |
| `settings` (id `main`) | empresa, horários e marca |

**Por que JSONB genérico, e não uma tabela por entidade?** Para colocar o sistema no ar rápido e permitir que quem instala evolua o modelo sem escrever migrações. O custo é que relatórios em SQL ficam menos diretos.

**Quando revisitar:** acima de cerca de 100 mil mensagens, ou quando houver integração server-side com WhatsApp. Nesse ponto vale mover `messages` e `conversations` para tabelas próprias com índices. O índice parcial `crm_records_conversation_idx` já ajuda nas consultas de mensagens.

## Fluxo de dados

1. **Login:** o Supabase Auth valida o usuário. O `sync.loadRemote()` carrega tudo e confere se o usuário faz parte da equipe.
2. **Edição local:** as ações da store alteram o estado imediatamente (interface otimista). O `sync.flush()` compara referências e envia upserts e deletes em lote a cada 350 ms.
3. **Outros atendentes:** o Realtime entrega INSERT, UPDATE e DELETE, e `applyRemote()` aplica a mudança sem gerar eco.
4. **Modo local** (sem variáveis do Supabase): a mesma store é persistida no `localStorage`.

## Automação (ordem de prioridade)

```
mensagem recebida
   ├─ chatbot ativo na conexão? → envia o menu ou executa a opção escolhida
   ├─ IA ligada na conversa?   → runAgent(): transfere (palavra-chave ou limite de respostas)
   │                                        ou responde (servidor de IA → motor local)
   └─ senão                    → fica na fila do departamento
a cada 15 s (no navegador de um admin): follow-ups vencidos, disparos agendados, mensagens agendadas
```

## Segurança

### Banco (Supabase)

- **RLS:** só quem está na coleção `users` lê ou grava. Uma conta criada fora do CRM não enxerga nada. Configurações, conexões e usuários exigem perfil admin. Um gatilho impede que um atendente altere o próprio perfil de acesso.
- As funções `SECURITY DEFINER` têm `search_path` vazio e não são executáveis pelo papel anônimo. O papel `anon` não tem acesso à tabela.
- `supabase/test-rls.sh` (`npm run test:rls`) sobe um PostgreSQL 16 temporário, aplica o schema duas vezes e confere 30 permissões de estranho, atendente, admin e anônimo.
- A chave `service_role` é usada só pelo instalador e não fica salva.

### Servidor (`server/index.mjs`)

- **Cabeçalhos em todas as respostas:** CSP restrita (scripts e estilos só do próprio site, o React usa estilos inline; conexões só com o Supabase em `https`/`wss`; imagens só `data:`/`blob:`, então imagens remotas não carregam), `X-Frame-Options: DENY` com `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy` (câmera, microfone, localização, pagamento e USB desligados), `X-Content-Type-Options: nosniff`. O Caddy acrescenta HSTS e remove o cabeçalho `Server`.
- **Caminhos:** o arquivo pedido é resolvido dentro de `dist/`; caminhos com `..`, `%2e%2e`, barra invertida ou byte inválido não vazam arquivos e não derrubam o processo.
- **Conexões lentas:** timeouts de cabeçalho (15 s) e de requisição (60 s).
- **`/api/ai/reply`:**
  - Exige `Content-Type: application/json`, aceita no máximo 256 KB e corta campos longos (prompt 8 mil caracteres, base de conhecimento 40 mil no total, histórico nas últimas 40 mensagens de até 4 mil caracteres).
  - Com o Supabase ativo, a pessoa precisa ter um token válido **e** estar cadastrada na equipe (a mesma regra da RLS). O token é conferido com timeout de 5 s e fica em cache por 60 s, sem consultar o Supabase a cada mensagem.
  - Erros do provedor viram mensagens genéricas; detalhes ficam só no log do servidor.
  - Sem o Supabase, só aceita chamadas do próprio computador (desenvolvimento).
- **Limite de uso:** 60 requisições por minuto por IP, contadas antes da autenticação. Atrás do Caddy, `TRUST_PROXY=1` faz o servidor ler o IP real do `X-Forwarded-For`, que o Caddy acrescenta no fim; sem isso, todos os usuários dividiriam um único limite. Só ligue `TRUST_PROXY` se houver exatamente um proxy confiável na frente.
- **Prompt de sistema:** mensagens do cliente, nome, histórico, base de conhecimento e catálogo são tratados como dados, dentro de tags próprias. O agente não revela as instruções internas e respeita o desconto máximo, mesmo que o cliente diga que outra pessoa aprovou.
- A chave de IA fica só no servidor e nunca aparece nas respostas.

### Front-end

- **Exportações CSV:** células que começam com `=`, `+`, `-`, `@`, tab ou CR recebem um apóstrofo antes de virar planilha (`src/lib/csv.ts`).
- **Anexos no chat:** só PNG, JPEG, GIF e WebP viram foto (até 1,5 MB); outros tipos entram como documento; arquivos acima de 16 MB são recusados.
- **Senhas do modo local:** guardadas como hash PBKDF2-HMAC-SHA256 (600 mil iterações, salt aleatório), em `src/lib/password.ts`. Contas antigas com senha em texto puro são migradas no primeiro login. O login demo (`admin@demo.com`) continua com a senha pública `demo123`. Senhas nunca vão para o banco nem para o backup.

### Infraestrutura

- `docker-compose.yml`: `no-new-privileges`, `cap_drop: ALL` (o Caddy recebe só `NET_BIND_SERVICE`), sistema de arquivos somente leitura com `tmpfs` em `/tmp`, limites de memória e de processos, rotação de logs.
- O app roda como usuário `node` (Dockerfile). Testes e documentação não entram na imagem.

### Limitações conhecidas

- **Prompt injection não tem solução completa.** As instruções de defesa reduzem o risco, mas o modelo pode seguir um pedido malicioso. A única ação que a resposta do modelo consegue disparar é transferir a conversa para a fila humana (`[TRANSFERIR]`). Ele não acessa o banco, outras conversas nem as configurações.
- **Estilos inline:** a CSP usa `style-src 'unsafe-inline'` porque o React define `style=""` em tempo de execução. Scripts continuam restritos a `'self'`.
- **Modo local sem HTTPS:** o hash de senha precisa de `crypto.subtle`, que só existe em HTTPS ou `localhost`. Fora disso, login e cadastro mostram aviso em vez de gravar a senha sem proteção.
- **Revogação de acesso:** quem foi removido da equipe pode continuar usando a IA por até 60 s (tempo do cache de token).
- **Risco de banimento no WhatsApp:** conexões não oficiais (QR Code de gateways) e envio em massa são o principal risco da operação. O envio em massa usa intervalo com variação aleatória de ±30%, mas isso não elimina o risco. A Cloud API oficial exige opt-in dos contatos.

## Escala e confiabilidade

- Uma VPS KVM 2 aguenta com folga uma equipe de 5 a 20 atendentes. O servidor quase não guarda estado.
- O Supabase cuida de backup e disponibilidade do banco. O Caddy renova o certificado sozinho.
- **Ponto fraco conhecido:** follow-ups e disparos dependem de um navegador de administrador aberto. O próximo passo é mover esse agendador para o `server/`, usando a `service_role` em um processo separado.

## Decisões e trade-offs

| Decisão | Ganho | Custo |
|---|---|---|
| Regra de negócio no cliente | Desenvolvimento rápido, funciona offline (modo local) | Automação depende de um cliente aberto |
| JSONB genérico | Zero migrações, sincronização simples | Relatórios em SQL menos diretos |
| Caddy em vez de Nginx + Certbot | HTTPS sem configuração | Um container a mais |
| Motor local de IA como fallback | O CRM funciona sem chave e sem custo | Respostas menos naturais |
