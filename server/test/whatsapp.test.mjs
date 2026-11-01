// Testes: leitura do webhook da Evolution e cliente HTTP do gateway (contra uma Evolution falsa).
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEvolution, instanceName, parseWebhook, WEBHOOK_EVENTS } from '../whatsapp.mjs';
import { fakeEvolution } from '../support/helpers.mjs';

const upsert = (data, event = 'messages.upsert') => ({ event, instance: 'leadflow-con-1', data, apikey: 'x' });
const msg = (message, key = {}) => ({
  key: { remoteJid: '5531988887777@s.whatsapp.net', fromMe: false, id: 'ABC1', ...key },
  pushName: 'Maria',
  message,
  messageTimestamp: 1767225600,
});

describe('parseWebhook: mensagens recebidas', () => {
  it('texto simples vira mensagem com telefone, nome, id e data', () => {
    const [e] = parseWebhook(upsert(msg({ conversation: 'Oi, tudo bem?' })));
    assert.deepEqual(e, {
      type: 'message',
      message: {
        instance: 'leadflow-con-1',
        id: 'ABC1',
        fromMe: false,
        phone: '5531988887777',
        name: 'Maria',
        text: 'Oi, tudo bem?',
        kind: 'text',
        at: new Date(1767225600 * 1000).toISOString(),
      },
    });
  });

  it('aceita o nome do evento em MAIÚSCULAS e data como lista', () => {
    const events = parseWebhook(upsert([msg({ extendedTextMessage: { text: 'link https://x.com' } })], 'MESSAGES_UPSERT'));
    assert.equal(events.length, 1);
    assert.equal(events[0].message.text, 'link https://x.com');
  });

  it('ignora grupos, status e canais', () => {
    for (const remoteJid of ['123-456@g.us', 'status@broadcast', '999@newsletter']) {
      assert.deepEqual(parseWebhook(upsert(msg({ conversation: 'oi' }, { remoteJid }))), [], remoteJid);
    }
  });

  it('contato com privacidade (@lid) usa o número alternativo quando existe', () => {
    const [e] = parseWebhook(upsert(msg({ conversation: 'oi' }, { remoteJid: '1234@lid', senderPn: '5531977776666@s.whatsapp.net' })));
    assert.equal(e.message.phone, '5531977776666');
    assert.deepEqual(parseWebhook(upsert(msg({ conversation: 'oi' }, { remoteJid: '1234@lid' }))), []);
  });

  it('mídia entra como aviso com o tipo certo; reação é ignorada', () => {
    assert.deepEqual(
      parseWebhook(upsert(msg({ imageMessage: { caption: 'meu sorriso' } }))).map((e) => [e.message.kind, e.message.text]),
      [['image', '📷 meu sorriso']],
    );
    assert.equal(parseWebhook(upsert(msg({ audioMessage: {} })))[0].message.kind, 'audio');
    assert.equal(parseWebhook(upsert(msg({ documentMessage: { fileName: 'orcamento.pdf' } })))[0].message.text, 'orcamento.pdf');
    assert.deepEqual(parseWebhook(upsert(msg({ reactionMessage: { text: '👍' } }))), []);
  });

  it('mensagem temporária é desembrulhada', () => {
    const [e] = parseWebhook(upsert(msg({ ephemeralMessage: { message: { conversation: 'some em 24h' } } })));
    assert.equal(e.message.text, 'some em 24h');
  });

  it('mensagem enviada pelo próprio celular vem com fromMe', () => {
    const [e] = parseWebhook(upsert(msg({ conversation: 'enviei do celular' }, { fromMe: true })));
    assert.equal(e.message.fromMe, true);
  });

  it('corpo inválido ou sem instância não gera eventos', () => {
    assert.deepEqual(parseWebhook(null), []);
    assert.deepEqual(parseWebhook('texto'), []);
    assert.deepEqual(parseWebhook({ event: 'messages.upsert', data: msg({ conversation: 'oi' }) }), []);
  });
});

describe('parseWebhook: entrega e conexão', () => {
  it('messages.update vira confirmação de entrega/leitura', () => {
    const events = parseWebhook({
      event: 'messages.update',
      instance: 'leadflow-con-1',
      data: [
        { keyId: 'WA-1', status: 'DELIVERY_ACK', fromMe: true },
        { keyId: 'WA-2', status: 'READ', fromMe: true },
        { keyId: 'WA-3', status: 'SERVER_ACK', fromMe: true },
      ],
    });
    assert.deepEqual(events, [
      { type: 'ack', id: 'WA-1', status: 'delivered' },
      { type: 'ack', id: 'WA-2', status: 'read' },
    ]);
  });

  it('connection.update traz estado e número conectado', () => {
    assert.deepEqual(parseWebhook({ event: 'connection.update', instance: 'leadflow-con-1', data: { state: 'open', wuid: '5531900001111@s.whatsapp.net' } }), [
      { type: 'connection', instance: 'leadflow-con-1', state: 'open', phone: '5531900001111' },
    ]);
    assert.deepEqual(parseWebhook({ event: 'CONNECTION_UPDATE', instance: 'i', data: { state: 'close' } })[0].state, 'close');
  });
});

describe('instanceName', () => {
  it('aceita ids de conexão e recusa o resto', () => {
    assert.equal(instanceName('leadflow-', 'con-abc_1'), 'leadflow-con-abc_1');
    for (const bad of ['', '../x', 'a b', 'x'.repeat(81), undefined, 12]) assert.equal(instanceName('leadflow-', bad), bad === 12 ? 'leadflow-12' : null);
  });
});

describe('cliente da Evolution', () => {
  let evo;
  let client;
  before(async () => {
    evo = await fakeEvolution();
    client = createEvolution({ url: `${evo.url}/`, apiKey: evo.apiKey });
  });
  after(() => evo.close());

  it('connect cria a instância com webhook e devolve o QR da criação', async () => {
    const r = await client.connect('leadflow-con-1', { webhookUrl: 'https://crm.teste/api/whatsapp/webhook', token: 'tok' });
    assert.deepEqual(r, { state: 'close', qr: { base64: 'data:image/png;base64,QRCRIADO', code: '2@abc', pairingCode: null } });
    const create = evo.requests.find((q) => q.url === '/instance/create');
    assert.equal(create.headers.apikey, evo.apiKey);
    assert.equal(create.body.integration, 'WHATSAPP-BAILEYS');
    assert.equal(create.body.webhook.url, 'https://crm.teste/api/whatsapp/webhook');
    assert.equal(create.body.webhook.headers['x-webhook-token'], 'tok');
    assert.deepEqual(create.body.webhook.events, WEBHOOK_EVENTS);
    assert.ok(evo.requests.some((q) => q.url === '/webhook/set/leadflow-con-1'));
  });

  it('instância que já existe é reaproveitada e o QR vem de /instance/connect', async () => {
    const r = await client.connect('leadflow-con-1', { webhookUrl: 'https://crm.teste/api/whatsapp/webhook', token: 'tok' });
    assert.equal(r.qr.base64, 'data:image/png;base64,QRNOVO');
  });

  it('já conectada: não pede QR', async () => {
    evo.ctl.state = 'open';
    const r = await client.connect('leadflow-con-1', { webhookUrl: 'u', token: 't' });
    assert.deepEqual(r, { state: 'open', qr: null });
    evo.ctl.state = 'close';
  });

  it('sendText manda número e texto e devolve o id do WhatsApp', async () => {
    const r = await client.sendText('leadflow-con-1', '5531988887777', 'Olá!');
    assert.equal(r.id, 'WA-1');
    assert.deepEqual(evo.ctl.sent.at(-1), { instance: 'leadflow-con-1', number: '5531988887777', text: 'Olá!' });
  });

  it('erro do gateway vira exceção com status, sem vazar a chave', async () => {
    const bad = createEvolution({ url: evo.url, apiKey: 'errada' });
    await assert.rejects(bad.sendText('i', '1', 'x'), (err) => err.status === 401 && !err.message.includes('errada'));
  });
});
