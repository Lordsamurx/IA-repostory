// Testes: API oficial do WhatsApp (Meta Cloud API) — cliente, webhook e rotas /api/whatsapp/meta*.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from '../index.mjs';
import { createMeta, metaInstance, parseMetaWebhook, verifyMetaSignature } from '../meta.mjs';
import { ANON_KEY, adminAuth, fakeMeta, fakeSupabaseRoles, makeDist, memberAuth } from '../support/helpers.mjs';

const PHONE_ID = '1098765';
const INSTANCE = metaInstance(PHONE_ID);
const APP_SECRET = 'segredo-do-app-meta';
const VERIFY = 'verifica-meta';

const metaBody = (value) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: PHONE_ID }, ...value } }] }],
});
const inbound = metaBody({
  contacts: [{ wa_id: '5531988887777', profile: { name: 'Maria' } }],
  messages: [{ from: '5531988887777', id: 'wamid.IN1', timestamp: '1767000000', type: 'text', text: { body: 'Oi, tudo bem?' } }],
});
const sign = (raw, secret = APP_SECRET) => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

describe('parseMetaWebhook', () => {
  it('mensagem recebida vira evento do worker com a instância meta:<phone id>', () => {
    const [ev] = parseMetaWebhook(inbound);
    assert.equal(ev.type, 'message');
    assert.deepEqual(
      { ...ev.message, at: undefined },
      { instance: INSTANCE, id: 'wamid.IN1', fromMe: false, phone: '5531988887777', name: 'Maria', text: 'Oi, tudo bem?', kind: 'text', at: undefined },
    );
    assert.equal(ev.message.at, new Date(1767000000 * 1000).toISOString());
  });

  it('botões, mídia e tipos sem texto', () => {
    const events = parseMetaWebhook(
      metaBody({
        messages: [
          { from: '5531911112222', id: 'a', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'Quero orçamento' } } },
          { from: '5531911112222', id: 'b', type: 'image', image: { caption: 'meu sorriso' } },
          { from: '5531911112222', id: 'c', type: 'audio', audio: {} },
          { from: '5531911112222', id: 'd', type: 'reaction', reaction: { emoji: '👍' } },
        ],
      }),
    );
    assert.deepEqual(
      events.map((e) => [e.message.kind, e.message.text]),
      [
        ['text', 'Quero orçamento'],
        ['image', '📷 meu sorriso'],
        ['audio', '🎤 Áudio'],
      ],
    );
  });

  it('status: entregue e lido viram ack; falha traz o motivo traduzido', () => {
    const events = parseMetaWebhook(
      metaBody({
        statuses: [
          { id: 'wamid.1', status: 'sent' },
          { id: 'wamid.1', status: 'delivered' },
          { id: 'wamid.1', status: 'read' },
          { id: 'wamid.2', status: 'failed', errors: [{ code: 131047, title: 'Re-engagement message' }] },
        ],
      }),
    );
    assert.deepEqual(events, [
      { type: 'ack', instance: INSTANCE, id: 'wamid.1', status: 'delivered' },
      { type: 'ack', instance: INSTANCE, id: 'wamid.1', status: 'read' },
      { type: 'failed', instance: INSTANCE, id: 'wamid.2', error: 'Janela de 24 h fechada: envie um template aprovado pela Meta' },
    ]);
  });

  it('ignora o que não é da Meta', () => {
    assert.deepEqual(parseMetaWebhook({ event: 'messages.upsert', instance: 'x', data: {} }), []);
    assert.deepEqual(parseMetaWebhook(null), []);
  });
});

describe('verifyMetaSignature', () => {
  const raw = Buffer.from(JSON.stringify(inbound));
  it('confere só com o App Secret certo', () => {
    assert.equal(verifyMetaSignature(APP_SECRET, raw, sign(raw)), true);
    assert.equal(verifyMetaSignature(APP_SECRET, raw, sign(raw, 'outro')), false);
    assert.equal(verifyMetaSignature(APP_SECRET, raw, 'sha256=abc'), false);
    assert.equal(verifyMetaSignature(APP_SECRET, raw, undefined), false);
  });
  it('sem App Secret nunca confere (falha fechada)', () => {
    assert.equal(verifyMetaSignature('', raw, sign(raw, '')), false);
  });
});

describe('cliente da Meta', () => {
  let meta;
  let client;
  before(async () => {
    meta = await fakeMeta({ phoneId: PHONE_ID });
    client = createMeta({ token: meta.token, phoneId: PHONE_ID, baseUrl: meta.url });
  });
  after(() => meta.close());

  it('sendText e sendTemplate mandam o formato da Cloud API e devolvem o wamid', async () => {
    assert.deepEqual(await client.sendText('5531988887777', 'Olá!'), { id: 'wamid.1' });
    assert.deepEqual(await client.sendTemplate('5531988887777', 'boas_vindas', 'pt_BR'), { id: 'wamid.2' });
    assert.deepEqual(meta.ctl.sent, [
      { messaging_product: 'whatsapp', recipient_type: 'individual', to: '5531988887777', type: 'text', text: { preview_url: false, body: 'Olá!' } },
      { messaging_product: 'whatsapp', recipient_type: 'individual', to: '5531988887777', type: 'template', template: { name: 'boas_vindas', language: { code: 'pt_BR' } } },
    ]);
  });

  it('erro conhecido da Meta vira mensagem para o atendente, sem vazar o token', async () => {
    meta.ctl.failCode = 131047;
    const err = await client.sendText('5531988887777', 'Oi').catch((e) => e);
    assert.equal(err.code, 131047);
    assert.equal(err.userMessage, 'Janela de 24 h fechada: envie um template aprovado pela Meta');
    assert.doesNotMatch(err.message + err.detail, new RegExp(meta.token));
  });

  it('info devolve o número só com dígitos e o nome verificado', async () => {
    assert.deepEqual(await client.info(), { phone: '553133330000', name: 'Odonto Teste' });
  });
});

/** Sobe o app com runtime controlado (worker e Meta falsos). */
function boot(cfg, runtime) {
  const server = createServer({ port: 0, supabaseAnonKey: ANON_KEY, aiApiKey: '', trustProxy: 0, rateLimitPerMinute: 60, ...cfg }, runtime);
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => (server.closeAllConnections(), server.close(() => done()))),
      }),
    ),
  );
}

function fakeWorker() {
  const events = [];
  return { events, hasInstance: (i) => i === INSTANCE, ingest: (e) => (events.push(e), 'ok') };
}

describe('/api/whatsapp/meta', () => {
  let dist;
  let app;
  let worker;
  before(async () => {
    dist = makeDist();
    worker = fakeWorker();
    app = await boot({ staticDir: dist.dist, metaAppSecret: APP_SECRET, metaVerifyToken: VERIFY }, { worker });
  });
  after(async () => {
    await app.close();
    dist.cleanup();
  });

  it('GET com o verify_token certo devolve o hub.challenge', async () => {
    const ok = await fetch(`${app.url}/api/whatsapp/meta?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=12345`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), '12345');
    const bad = await fetch(`${app.url}/api/whatsapp/meta?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=12345`);
    assert.equal(bad.status, 403);
  });

  it('POST sem assinatura válida é recusado e não chega ao worker', async () => {
    const raw = JSON.stringify(inbound);
    for (const sig of [undefined, sign(raw, 'outro')]) {
      const r = await fetch(`${app.url}/api/whatsapp/meta`, { method: 'POST', headers: { 'content-type': 'application/json', ...(sig ? { 'x-hub-signature-256': sig } : {}) }, body: raw });
      assert.equal(r.status, 401);
    }
    assert.equal(worker.events.length, 0);
  });

  it('POST assinado entrega os eventos ao worker', async () => {
    const raw = JSON.stringify(inbound);
    const r = await fetch(`${app.url}/api/whatsapp/meta`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(raw) }, body: raw });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, handled: 1 });
    assert.equal(worker.events[0].message.instance, INSTANCE);
  });

  it('sem App Secret no servidor o webhook fica fechado (503)', async () => {
    const closed = await boot({ staticDir: dist.dist }, { worker: fakeWorker() });
    const raw = JSON.stringify(inbound);
    const r = await fetch(`${closed.url}/api/whatsapp/meta`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(raw, '') }, body: raw });
    assert.equal(r.status, 503);
    await closed.close();
  });
});

describe('/api/whatsapp/meta/link', () => {
  let dist;
  let sb;
  let meta;
  let app;
  before(async () => {
    dist = makeDist();
    sb = await fakeSupabaseRoles();
    meta = await fakeMeta({ phoneId: PHONE_ID });
    app = await boot({ staticDir: dist.dist, supabaseUrl: sb.url }, { meta: createMeta({ token: meta.token, phoneId: PHONE_ID, baseUrl: meta.url }) });
  });
  after(async () => {
    await app.close();
    await meta.close();
    await sb.close();
    dist.cleanup();
  });

  const link = (headers) => fetch(`${app.url}/api/whatsapp/meta/link`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });

  it('admin recebe a instância e o número verificado', async () => {
    const r = await link(adminAuth);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { instance: INSTANCE, phone: '553133330000', name: 'Odonto Teste' });
  });

  it('atendente e anônimo não ligam números', async () => {
    assert.equal((await link(memberAuth)).status, 401);
    assert.equal((await link({})).status, 401);
  });

  it('health informa a API oficial configurada', async () => {
    const h = await (await fetch(`${app.url}/api/health`)).json();
    assert.equal(h.meta, true);
  });
});
