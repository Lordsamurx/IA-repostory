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

- **RLS:** só quem está na coleção `users` lê ou grava. Uma conta criada fora do CRM não enxerga nada. Configurações, conexões e usuários exigem perfil admin. Um gatilho impede que um usuário altere o próprio perfil de acesso. Essas regras foram testadas em PostgreSQL 16 durante o desenvolvimento, simulando estranho, atendente e admin.
- A chave `service_role` é usada só pelo instalador e não fica salva.
- A chave de IA fica só no servidor. Com o Supabase ativo, `/api/ai/reply` exige o token de um usuário logado. Sem o Supabase, aceita apenas chamadas de localhost.
- Há limite de 60 respostas de IA por minuto por IP.
- Senhas do modo local nunca vão para o banco nem para o backup.

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
