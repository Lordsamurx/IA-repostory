# Design system

Inspirado no visual das plataformas de atendimento por WhatsApp: menu lateral escuro, área de trabalho clara, chat com o papel de parede e as bolhas do WhatsApp.

## Tokens (`src/index.css`)

| Token | Valor | Uso |
|---|---|---|
| `--brand` | `#00a389` (troca em Configurações → Aparência) | botões, foco, abas ativas, badges |
| `brand-50…800` | derivados de `--brand` com `color-mix` | fundos suaves, hover, texto sobre fundo claro |
| `--sidebar` | `#0e1f2b` | menu lateral |
| `--canvas` / `--surface` / `--line` | `#f3f5f7` / `#fff` / `#e4e8ec` | fundo da página, cartões, bordas |
| `--ink` / `--ink-2` / `--ink-3` | `#15212b` / `#4f5d69` / `#8592a0` | texto principal, secundário, apagado |
| `--chat-bg` | `#efeae2` + pontilhado | fundo do chat |
| `--bubble-in` / `--bubble-out` / `--bubble-note` | branco / `#d9fdd3` / `#fff4cc` | mensagem recebida, enviada, nota interna |
| `--good` `--warning` `--serious` `--critical` | `#0ca30c` `#fab219` `#ec835a` `#d03b3b` | status, sempre com ícone e texto |

Tipografia: Inter / fonte do sistema, base de 14 px. Raios: 8 px para controles, 12 px para cartões, 16 px para modais. Sombras: `shadow-card` e `shadow-pop`.

## Componentes (`src/components/ui.tsx`)

| Componente | Variantes / observações |
|---|---|
| `Button` | `primary`, `secondary`, `ghost`, `danger`, `soft`; tamanhos `sm`, `md`, `lg`; foco visível |
| `IconButton` | sempre com `label` (aria-label e title) |
| `Input`, `Textarea`, `Select`, `Field`, `SearchInput`, `Switch` | anel de foco na cor da marca; `Switch` com `role="switch"` |
| `Avatar` | iniciais + cor; ponto de presença (online / ausente / offline) |
| `Badge`, `TagChip` | tons semânticos; etiqueta com bolinha de cor e texto |
| `Card`, `StatTile`, `PageHeader`, `EmptyState`, `Tabs` | blocos de página |
| `Modal`, `Drawer`, `Confirm`, `Menu`, `Toasts` | fecham com Esc e clique fora; `role="dialog"` |

## Gráficos (`src/components/charts.tsx`)

Regras da skill de visualização de dados:

- Paleta categórica validada (slot 1 = `#2a78d6`). Uma série usa uma cor só; categorias nominais **não** recebem rampa de cor.
- Etapas do funil usam uma **rampa ordinal azul** (`#86b6ef` → `#184f95`), aplicada também às barras das etapas no Kanban.
- Marcas finas, cantos de 4 px na ponta do dado, grade sólida e discreta, sem eixo duplo.
- Todo gráfico tem tooltip. Barras ranqueadas trazem rótulo de valor.
- Cores de status nunca são usadas como série.

## Padrões

- **Lista de conversas:** avatar com bolinha da conexão, nome, horário, prévia (com ícone para IA, nota, áudio ou documento), contador de não lidas, chips de “Na fila”, “IA” e etiquetas, e avatar do responsável.
- **Mensagens automáticas** são identificadas no topo da bolha: 🤖 Agente, 🤖 Chatbot, 📣 Disparo, 🔁 Follow-up.
- **Notas internas** ficam em amarelo, com borda, e não são enviadas ao cliente.
