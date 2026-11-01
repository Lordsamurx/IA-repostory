# WhatsApp real e automação 24 h

## Como funciona

```
 Celular do lead ──► WhatsApp ──► Evolution API ──webhook──► app (server/index.mjs)
                                       ▲                         │
                                       │ sendText                ▼
                                       └──────────────── worker de automação (server/worker)
                                                          │  mesmas regras do CRM (src/lib)
                                                          ▼
                                                      Supabase (crm_records) ──Realtime──► navegadores da equipe
```

- **Recebimento:** a Evolution chama `POST /api/whatsapp/webhook`. O worker procura o contato pelo telefone (com e sem o nono dígito), cria contato, conversa e negócio na 1ª etapa do funil se for novo, e grava a mensagem. Em seguida roda **NPS → chatbot → agente de IA**, como no simulador.
- **Envio:** toda mensagem de saída numa conexão real (atendente no navegador, chatbot, IA, follow-up, disparo, agendada) entra no banco e o worker envia pela Evolution (**caixa de saída**). O ID do WhatsApp fica gravado na mensagem, o que evita reenvio e duplicidade.
- **Status:** ✓ enviada → ✓✓ entregue → ✓✓ azul lida, vindos do WhatsApp (`messages.update`). Se o envio falha, o chat mostra “não enviada” com o motivo.
- **Conexão:** a tela Conexões pede o QR ao servidor (`POST /api/whatsapp/connect`), mostra o QR real, renova a cada ~30 s e fecha sozinha quando o celular conecta. Desconectar ou excluir a conexão faz logout no gateway.
- **Mensagens do próprio celular** (fora do CRM) entram no histórico sem disparar automação.
- **Grupos, status e canais** são ignorados.

### Automação 24 h (worker)

Com `SUPABASE_SERVICE_ROLE_KEY` no `.env`, o servidor carrega o worker (`server/worker/automation.mjs`, gerado pelo `npm run build`). Ele roda o mesmo código de regras do navegador: chatbot, agentes de IA, follow-ups, disparos e mensagens agendadas. O navegador consulta `/api/health` (`"automation": true`) e **não** executa automações, para não duplicar envios.

Sem a chave, tudo continua como antes: as automações rodam no navegador de um administrador logado e as conexões são simuladas.

Os horários (agentes, expediente) seguem o **fuso configurado no CRM** (Configurações → Empresa), não o fuso da VPS.

## Configurar

Na VPS, depois do `install.sh` (ou durante ele):

```bash
sudo bash SETUP-KIT/whatsapp.sh
```

| Opção | Quando usar | O que vai para o `.env` |
|---|---|---|
| 1. Evolution que já existe | Você já tem uma Evolution (ex.: a de teste) | `EVOLUTION_API_URL` (https), `EVOLUTION_API_KEY` (chave global), `WHATSAPP_WEBHOOK_URL=https://SEU_DOMINIO/api/whatsapp/webhook` |
| 2. Evolution nesta VPS | Não tem Evolution ainda | `COMPOSE_PROFILES=evolution`, `EVOLUTION_API_URL=http://evolution:8080`, chave e senha do banco geradas, webhook interno `http://app:8787/...` |
| 3. Depois | Só a automação 24 h, sem WhatsApp real | — |

O script também gera o `WHATSAPP_WEBHOOK_TOKEN`. A Evolution recebe esse segredo sozinha (cabeçalho `x-webhook-token`) quando você conecta um número. Ninguém precisa configurar o webhook no painel da Evolution.

Na opção 2, a Evolution e o banco dela ficam **só na rede interna do Docker**: nenhuma porta nova é aberta.

### Variáveis

| Variável | Para quê |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Liga o worker (automação 24 h + WhatsApp). Só o servidor lê. |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` | Endereço e chave **global** da Evolution |
| `EVOLUTION_INSTANCE_PREFIX` | Prefixo das instâncias (padrão `leadflow-`). Instâncias de outros sistemas na mesma Evolution são ignoradas. |
| `WHATSAPP_WEBHOOK_TOKEN` | Segredo do webhook (obrigatório) |
| `WHATSAPP_WEBHOOK_URL` | Endereço que a Evolution chama. Padrão: `https://$DOMAIN/api/whatsapp/webhook` |
| `EVOLUTION_IMAGE` | Só na opção 2: imagem da Evolution (padrão fixo `evoapicloud/evolution-api:v2.1.1`) |

## VPS compartilhada (Hermes, Tailscale, outros serviços)

O CRM pode dividir a VPS com outros sistemas. O Caddy do CRM vira o único "porteiro" das portas 80/443 públicas e encaminha cada domínio para o serviço certo.

- **Tailscale na 443:** com `tailscale serve` (painel do Hermes, por exemplo), a 443 da tailnet já está ocupada e o Docker não consegue ligar em `0.0.0.0:443`. O `install.sh` detecta isso e grava `PUBLIC_BIND=<IP público>` no `.env`: o Caddy liga só no IP público e o painel continua na tailnet.
- **Outros sites no mesmo Caddy:** um arquivo `.caddy` por site em `SETUP-KIT/sites/`. Pasta vazia = só o CRM. Há um exemplo pronto para o webhook da OLX (`olx-webhook.caddy.exemplo`), com acesso só pelos IPs da OLX.
- **Serviço que roda direto na VPS** (fora do Docker, como o `hermes-olx` na 8090): o Caddy chega nele por `host.docker.internal`. O ufw bloqueia por padrão o tráfego da rede do Docker para o host, então libere só a porta do serviço:

  ```bash
  REDE=$(docker network inspect crm_default -f '{{.Id}}' | cut -c1-12)
  sudo ufw allow in on br-$REDE to any port 8090 proto tcp comment 'Caddy do CRM -> hermes-olx'
  ```

- **Firewall:** portas publicadas pelo Docker (80/443 do Caddy) ficam abertas mesmo com o ufw negando entrada. O instalador também libera 80/443 no ufw. Nada além disso é aberto (a Evolution local fica só na rede interna).

## VPS com EasyPanel (Hostinger)

O instalador usa o próprio **Caddy** nas portas 80/443. Se a VPS já tem EasyPanel (ou Coolify, Traefik, Nginx), essas portas estão ocupadas e o instalador avisa. Nesse caso há dois caminhos:

1. **VPS limpa só para o CRM** (recomendado para o teste): reinstale a VPS com Ubuntu 24.04 puro e siga o `install.sh`.
2. **Dentro do EasyPanel:** crie um app a partir deste repositório usando o `Dockerfile`, porta interna `8787`, e coloque no painel as variáveis do `.env` (incluindo `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` como *build args*). O domínio e o HTTPS ficam com o EasyPanel, e a Evolution pode ser outro app do mesmo painel. Nesse caso `TRUST_PROXY=1` continua valendo (um proxy na frente). (a validar: esse caminho ainda não foi testado numa instalação real)

## Limitações conhecidas

- **Só texto sai pelo WhatsApp.** Arquivos da biblioteca enviados numa conexão real ficam marcados “não enviada”. Mídia recebida entra como aviso (📷, 🎤, 🎬, documento com o nome), sem baixar o arquivo.
- **Formato da Evolution:** os campos seguem a documentação v2 (`/instance/create` com `integration: WHATSAPP-BAILEYS` e `webhook` aninhado, `/message/sendText` com `{ number, text }`, eventos `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE`). A própria documentação deles tem trechos contraditórios, e versões diferentes mudam detalhes. O código aceita as variações conhecidas e foi testado contra um simulador, não contra uma Evolution real. **Confirme com a sua Evolution na Fase 5 do [roteiro de teste](ROTEIRO-TESTE-VPS.md).**
- **Servidor fora do ar:** mensagens recebidas nesse período dependem de a Evolution reenviar o webhook. Mensagens de saída com mais de 10 minutos não são enviadas quando o servidor volta, para não disparar respostas velhas.
- **Risco de banimento:** QR Code é conexão não oficial. Use número dedicado, evite disparo em massa para quem não pediu e prefira a API oficial para volume.
- **API oficial (Meta) e provedores parceiros** continuam só cadastrais. A ponte (`src/lib/whatsapp.ts` e a caixa de saída) já é independente do gateway: para a Cloud API, falta um cliente como `server/whatsapp.mjs` e a rota de verificação `hub.verify_token`.

## Testar sem WhatsApp

O botão **Simular** do Inbox continua funcionando e **nunca usa uma conexão real**, para que as respostas automáticas não vão para um telefone inventado. Com o worker ligado, a mensagem simulada vai para o banco e o servidor responde, igual a uma mensagem real.
