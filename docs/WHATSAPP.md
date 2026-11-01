# Integração com o WhatsApp

## Como está hoje

- A tela **Conexões** cadastra números (QR Code, API oficial ou provedor parceiro) com nome, fila e status.
- A leitura do QR Code é **simulada**: você confirma o número e a conexão fica “conectada”.
- Mensagens recebidas vêm do **simulador** (Inbox → Simular, ou “Simular mensagem do cliente” no chat). Todo o resto (chatbot, IA, follow-ups, disparos, funil, análises) reage a elas exatamente como reagiria a mensagens reais.

Ou seja: o CRM está pronto, e o que falta é o “cano” entre o WhatsApp e o banco.

## Como ligar um gateway real

### Opção A: QR Code (Evolution API ou similar)

1. Adicione o gateway ao `docker-compose.yml` como um serviço próprio, acessível só pela rede interna.
2. No `server/index.mjs`, crie as rotas abaixo.

| Rota | O que faz |
|---|---|
| `POST /api/whatsapp/connect` | Cria a instância no gateway e devolve o QR (base64). A tela de Conexões mostra esse QR no lugar do ilustrativo. |
| `POST /api/whatsapp/webhook` | Recebe `messages.upsert` do gateway e grava em `crm_records` usando a `service_role`: o contato (pelo telefone), a conversa (se não houver uma aberta) e a mensagem (`direction: "in"`). O Realtime entrega a mensagem para a equipe na hora. |
| `POST /api/whatsapp/send` | O front chama esta rota em `sendMessage` (quando `direction: "out"` e não é nota) para enviar pelo gateway. Atualize o `status` da mensagem (`sent` → `delivered` → `read`) pelos eventos do webhook. |

3. Mova `runAgent`, `handleChatbot` e `runFollowUps` para o servidor, reaproveitando `src/lib/*`, para que a automação funcione com o CRM fechado.

### Opção B: API oficial (WhatsApp Cloud API da Meta)

- O webhook da Meta (verificação por `hub.verify_token`) aponta para `https://SEU_DOMINIO/api/whatsapp/meta`.
- O envio usa `POST https://graph.facebook.com/v.../{phone-number-id}/messages`, com o token permanente guardado no `.env` do servidor.
- Fora da janela de 24 horas, só é possível enviar **modelos aprovados**. Isso vale para os Disparos e Follow-ups.

## Cuidados

- QR Code é conexão não oficial e tem risco de banimento. Use um número dedicado ao atendimento, nunca o principal, e evite disparos em massa.
- Teste sempre com outro número: a mensagem precisa aparecer no Inbox em segundos, e a resposta precisa chegar de volta no celular.
- O número não pode estar conectado em outro sistema ou WhatsApp Web ao mesmo tempo.
