# LeadFlow CRM — CRM de WhatsApp com Agentes de IA

CRM para **gerir leads em atendimento pelo WhatsApp**: inbox compartilhada, funil de vendas (Kanban), chatbot de menu, agentes de IA, follow-ups automáticos, disparos e análises.

Projeto construído a partir do material _“Instale seu próprio CRM de WhatsApp com Agentes de IA”_: roda numa **VPS**, usa o **Supabase** como banco e fica num **domínio próprio** com HTTPS. Licença **MIT**: você pode instalar, modificar, colocar sua marca e vender.

> Visual inspirado em plataformas de atendimento como o ChatGuru: menu lateral escuro, lista de conversas com etiquetas coloridas, chat no estilo WhatsApp e painel do lead ao lado. O código e o design são originais.

---

## Módulos

| Menu | O que faz |
|---|---|
| **Painel** | Leads do dia, fila de espera, conversas por atendente, tempo de 1ª resposta, vendas, funil e tarefas do dia |
| **Inbox** | Abas Meus / Fila / Todos / Finalizados, busca, filtro por conexão e etiqueta. Chat com bolhas do WhatsApp, ✓✓ de leitura, notas internas, respostas rápidas (`/atalho`), emojis, anexos, **mensagens agendadas**, assumir, atribuir, transferir, finalizar e reabrir, ligar e desligar a IA por conversa. Painel do lead com etiquetas, dados, **campos personalizados**, negócios, tarefas e anotações |
| **Disparos** | Envio em massa segmentado por etiqueta, origem ou etapa do funil, com pré-visualização, intervalo aleatório anti-bloqueio, agendamento, pausa e retomada, e taxa de resposta |
| **Funis** | Kanban com arrastar e soltar, áreas de Ganho e Perdido (com motivo), vários funis, editor de etapas e probabilidades, previsão ponderada e negócios com produtos |
| **Contatos** | Tabela com filtros, paginação, seleção em massa e importação e exportação de CSV, com detecção de número duplicado |
| **Tarefas** | Agrupadas em Atrasadas / Hoje / Amanhã / Próximos dias, com tipo, prioridade e responsável |
| **Produtos** | Catálogo com preço, categoria e SKU, usado nos negócios e pela IA |
| **Agentes de IA** | Identidade e prompt, tom, modelo, base de conhecimento, perguntas de qualificação, desconto máximo, regras de transferência para humano, horário e conexões. Tem uma **área de teste** que usa a configuração atual mesmo sem salvar |
| **Chatbot** | Menu numerado de boas-vindas. Cada opção pode transferir para um departamento, colocar uma etiqueta, criar ou mover um negócio no funil, passar para a IA ou finalizar. Tem simulador |
| **Follow-ups** | Sequências que disparam quando o lead para de responder e param sozinhas quando ele responde |
| **Base de conhecimento** | Perguntas frequentes, textos, links e documentos, com um campo para testar o que a IA encontraria |
| **Conexões** | WhatsApp por QR Code, API oficial (Meta) ou provedor parceiro, com fila e status |
| **Análises** | Conversão, receita, ticket médio, funil por etapa, origem dos leads, motivos de perda, desempenho da equipe e campanhas do Meta Ads (CPL, CTR, custo por venda), com exportação |
| **Configurações** | Empresa e horários, equipe e perfis (admin, supervisor, atendente), departamentos, etiquetas, campos personalizados, respostas rápidas, **aparência white label** (cor e nome), integrações de IA, checklist da instalação e backup |

**Ordem de atendimento de uma mensagem nova:** primeiro o chatbot (se houver fluxo ativo na conexão), depois o agente de IA e por fim a fila humana. Quando um atendente responde, a IA pausa sozinha.

---

## Rodando no seu computador (2 minutos)

Requisitos: Node.js 22+.

```bash
npm install
npm run dev
```

Abra http://localhost:5173 e entre com **admin@demo.com / demo123**. Sem o Supabase configurado, o sistema roda em **modo local**: tudo funciona e os dados ficam salvos no navegador, já com uma clínica odontológica de exemplo. Para começar do zero, use “crie sua empresa do zero” na tela de login.

Para testar sem WhatsApp, use o botão **Simular** no Inbox. Ele cria leads e mensagens de teste, o que permite ver o chatbot, a IA, os follow-ups e as notificações funcionando.

### Agentes com IA real (opcional)

Sem chave, os agentes usam um **motor local**: respondem pela base de conhecimento, fazem as perguntas de qualificação e transferem para humano. Para respostas geradas por modelo:

```bash
cd server && npm install
AI_PROVIDER=anthropic AI_API_KEY=sua-chave npm start   # porta 8787
```

Com o `npm run dev` rodando, o Vite encaminha `/api` para o servidor. A chave **fica só no servidor**, nunca no navegador.

---

## Instalando na VPS (produção)

Siga o material de instalação. Este repositório já traz o **`SETUP-KIT/install.sh`** citado no passo 5.

| Material | O que fazer |
|---|---|
| Passo 1 e 2 | Contratar a VPS (Ubuntu 24.04) e abrir o terminal |
| Passo 3 | Criar o projeto no Supabase e anotar a URL, a chave `anon`, a chave `service_role` e a URL do **Session Pooler** |
| Passo 4 | Criar o registro **A** do domínio apontando para o IP da VPS (com antecedência) |
| Passo 5 | Clonar o projeto e rodar o instalador (abaixo) |
| Passo 6 | Entrar com o e-mail e a senha criados e fazer o onboarding |
| Passo 7 | Conexões → Conectar novo WhatsApp |

```bash
git clone <url-deste-repositorio> crm && cd crm
sudo bash SETUP-KIT/install.sh
```

O instalador:

1. Instala o Docker.
2. Confere se o domínio já aponta para a VPS.
3. Valida cada chave do Supabase e avisa se você colou a chave errada.
4. Recusa a URL de conexão direta (`db.`) e aceita só o Session Pooler.
5. Cria as tabelas e as regras de segurança.
6. Cria o seu login de administrador.
7. Sobe o CRM com **HTTPS automático** (Caddy + Let's Encrypt).

A chave `service_role` é usada só durante a instalação e **não fica salva** no servidor.

Para atualizar depois de mudar o código ou o `.env`:

```bash
docker compose up -d --build
```

---

## Estrutura

```
src/
  pages/              uma página por módulo do menu
  components/         design system (ui.tsx), gráficos, inbox, modais
  store/useStore.ts   estado e regras de negócio (Zustand)
  lib/
    ai.ts             motor dos agentes (servidor de IA ou motor local)
    chatbot.ts        execução dos menus de chatbot
    automation.ts     IA automática, follow-ups, simulador
    broadcast.ts      disparos e mensagens agendadas
    sync.ts           sincronização com o Supabase + Realtime
    metrics.ts        cálculos das análises
  data/seed.ts        dados de demonstração e base vazia
server/index.mjs      API (IA) + serve a interface em produção
supabase/schema.sql   tabela, RLS e Realtime
SETUP-KIT/            instalador e Caddyfile
docs/                 arquitetura, design system, WhatsApp
```

Leia também:

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md): componentes, fluxo de dados, segurança e decisões.
- [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md): tokens, componentes e paleta dos gráficos.
- [docs/WHATSAPP.md](docs/WHATSAPP.md): como ligar um gateway real de WhatsApp.

---

## Estado atual e próximos passos

Pronto e testado:

- Todas as telas e regras de negócio.
- Persistência local.
- Sincronização multiusuário via Supabase, com RLS testado em PostgreSQL.
- API de IA (Anthropic ou OpenAI).
- Instalador e Docker.

**Ainda não integrado:** o envio e o recebimento reais de mensagens pelo WhatsApp. Hoje a conexão por QR Code é simulada e as mensagens “recebidas” vêm do simulador. O plano de integração (gateway de QR como a Evolution API, ou a Cloud API oficial da Meta, via webhook no `server/`) está em [docs/WHATSAPP.md](docs/WHATSAPP.md). O resto do sistema já está preparado para isso.

Outras limitações conhecidas:

- Follow-ups, disparos e mensagens agendadas rodam no navegador de um **administrador logado**. Em produção, o ideal é mover esse agendador para o `server/`.

## Licença

MIT. Use, modifique e revenda à vontade.
