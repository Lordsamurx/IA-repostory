// Testes: rotas /api/whatsapp/* — segredo do webhook, permissão de admin e repasse ao worker.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../index.mjs';
import { createEvolution } from '../whatsapp.mjs';
import {
  ANON_KEY,
  OUTSIDER_TOKEN,
  WEBHOOK_TOKEN,
  adminAuth,
  fakeEvolution,
  fakeSupabaseRoles,
  makeDist,
  memberAuth,
} from '../support/helpers.mjs';

/** Sobe o app com runtime controlado (worker e Evolution falsos). */
function boot(cfg, runtime) {
  const server = createServer(
    { port: 0, supabaseAnonKey: ANON_KEY, aiApiKey: '', trustProxy: 0, rateLimitPerMinute: 60, ...cfg },
    runtime,
  );
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => (server.closeAllConnections(), server.close(() => done()))),
      }),
    ),
  );
}

const post = (app, path, body, headers = {}) =>
  fetch(`${app.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

const inbound = (instance = 'leadflow-con-1') => ({
  event: 'messages.upsert',
  instance,
  data: { key: { remoteJid: '5531988887777@s.whatsapp.net', fromMe: false, id: 'X1' }, pushName: 'Maria', message: { conversation: 'Oi' } },
});

function fakeWorker() {
  const events = [];
  return {
    events,
    hasInstance: (i) => i === 'leadflow-con-1',
    ingest: (e) => (events.push(e), 'ok'),
  };
}

describe('/api/whatsapp/webhook', () => {
  let dist;
  const apps = [];
  before(() => (dist = makeDist()));
  after(async () => {
    for (const a of apps) await a.close();
    dist.cleanup();
  });

  it('sem WHATSAPP_WEBHOOK_TOKEN no servidor responde 503', async () => {
    const app = await boot({ staticDir: dist.dist, webhookToken: '' }, { worker: fakeWorker() });
    apps.push(app);
    assert.equal((await post(app, '/api/whatsapp/webhook', inbound())).status, 503);
  });

  it('segredo errado ou ausente responde 401 e não chega ao worker', async () => {
    const worker = fakeWorker();
    const app = await boot({ staticDir: dist.dist, webhookToken: WEBHOOK_TOKEN }, { worker });
    apps.push(app);
    assert.equal((await post(app, '/api/whatsapp/webhook', inbound())).status, 401);
    assert.equal((await post(app, '/api/whatsapp/webhook?token=errado', inbound())).status, 401);
    assert.equal((await post(app, '/api/whatsapp/webhook', inbound(), { 'x-webhook-token': 'errado' })).status, 401);
    assert.equal(worker.events.length, 0);
  });

  it('segredo certo (cabeçalho ou ?token=) entrega a mensagem ao worker', async () => {
    const worker = fakeWorker();
    const app = await boot({ staticDir: dist.dist, webhookToken: WEBHOOK_TOKEN }, { worker });
    apps.push(app);
    const r1 = await post(app, '/api/whatsapp/webhook', inbound(), { 'x-webhook-token': WEBHOOK_TOKEN });
    assert.deepEqual(await r1.json(), { ok: true, handled: 1 });
    const r2 = await post(app, `/api/whatsapp/webhook?token=${WEBHOOK_TOKEN}`, inbound());
    assert.equal(r2.status, 200);
    assert.equal(worker.events.length, 2);
    assert.equal(worker.events[0].message.text, 'Oi');
  });

  it('instância de outro sistema no mesmo gateway é ignorada', async () => {
    const worker = fakeWorker();
    const app = await boot({ staticDir: dist.dist, webhookToken: WEBHOOK_TOKEN }, { worker });
    apps.push(app);
    const r = await post(app, '/api/whatsapp/webhook', inbound('outro-sistema'), { 'x-webhook-token': WEBHOOK_TOKEN });
    assert.deepEqual(await r.json(), { ok: true, handled: 0 });
    assert.equal(worker.events.length, 0);
  });

  it('sem worker (automação desligada) responde 503 para o gateway tentar de novo', async () => {
    const app = await boot({ staticDir: dist.dist, webhookToken: WEBHOOK_TOKEN }, {});
    apps.push(app);
    assert.equal((await post(app, '/api/whatsapp/webhook', inbound(), { 'x-webhook-token': WEBHOOK_TOKEN })).status, 503);
  });

  it('GET responde 405', async () => {
    const app = await boot({ staticDir: dist.dist, webhookToken: WEBHOOK_TOKEN }, { worker: fakeWorker() });
    apps.push(app);
    assert.equal((await fetch(`${app.url}/api/whatsapp/webhook?token=${WEBHOOK_TOKEN}`)).status, 405);
  });
});

describe('/api/whatsapp/connect, status e disconnect', () => {
  let dist;
  let evo;
  let supa;
  let app;
  before(async () => {
    dist = makeDist();
    evo = await fakeEvolution();
    supa = await fakeSupabaseRoles();
    app = await boot(
      { staticDir: dist.dist, supabaseUrl: supa.url, webhookToken: WEBHOOK_TOKEN, webhookUrl: 'https://crm.teste/api/whatsapp/webhook' },
      { evolution: createEvolution({ url: evo.url, apiKey: evo.apiKey }) },
    );
  });
  after(async () => {
    await app.close();
    await evo.close();
    await supa.close();
    dist.cleanup();
  });

  it('health informa que o WhatsApp está configurado', async () => {
    const j = await (await fetch(`${app.url}/api/health`)).json();
    assert.equal(j.whatsapp, true);
    assert.equal(j.automation, false);
  });

  it('sem login, atendente ou estranho: 401 e nada chega ao gateway', async () => {
    const before = evo.requests.length;
    assert.equal((await post(app, '/api/whatsapp/connect', { connectionId: 'con-1' })).status, 401);
    assert.equal((await post(app, '/api/whatsapp/connect', { connectionId: 'con-1' }, memberAuth)).status, 401);
    assert.equal((await post(app, '/api/whatsapp/connect', { connectionId: 'con-1' }, { authorization: `Bearer ${OUTSIDER_TOKEN}` })).status, 401);
    assert.equal(evo.requests.length, before);
  });

  it('connectionId inválido responde 400', async () => {
    assert.equal((await post(app, '/api/whatsapp/connect', { connectionId: '../etc' }, adminAuth)).status, 400);
  });

  it('admin conecta: instância com prefixo, webhook com segredo e QR na resposta', async () => {
    const r = await post(app, '/api/whatsapp/connect', { connectionId: 'con-1' }, adminAuth);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.instance, 'leadflow-con-1');
    assert.equal(j.qr.base64, 'data:image/png;base64,QRCRIADO');
    const create = evo.requests.find((q) => q.url === '/instance/create');
    assert.equal(create.body.webhook.headers['x-webhook-token'], WEBHOOK_TOKEN);
  });

  it('status devolve o estado e, se pedido, um QR novo', async () => {
    const j = await (await post(app, '/api/whatsapp/status', { connectionId: 'con-1', qr: true }, adminAuth)).json();
    assert.deepEqual([j.state, j.qr.base64], ['close', 'data:image/png;base64,QRNOVO']);
    evo.ctl.state = 'open';
    const j2 = await (await post(app, '/api/whatsapp/status', { connectionId: 'con-1', qr: true }, adminAuth)).json();
    assert.deepEqual([j2.state, j2.qr], ['open', null]);
  });

  it('disconnect faz logout no gateway', async () => {
    const r = await post(app, '/api/whatsapp/disconnect', { connectionId: 'con-1' }, adminAuth);
    assert.deepEqual(await r.json(), { instance: 'leadflow-con-1', state: 'close' });
    assert.ok(evo.requests.some((q) => q.method === 'DELETE' && q.url === '/instance/logout/leadflow-con-1'));
  });

  it('gateway fora do ar ou recusando vira 502 sem detalhes internos', async () => {
    const broken = await boot(
      { staticDir: dist.dist, supabaseUrl: supa.url, webhookToken: WEBHOOK_TOKEN, webhookUrl: 'https://x/api/whatsapp/webhook' },
      { evolution: createEvolution({ url: evo.url, apiKey: 'chave-errada' }) },
    );
    const r = await post(broken, '/api/whatsapp/connect', { connectionId: 'con-1' }, adminAuth);
    assert.equal(r.status, 502);
    assert.ok(!(await r.text()).includes('chave-errada'));
    await broken.close();
  });

  it('sem Evolution configurada responde 503', async () => {
    const none = await boot({ staticDir: dist.dist, supabaseUrl: supa.url }, {});
    assert.equal((await post(none, '/api/whatsapp/connect', { connectionId: 'con-1' }, adminAuth)).status, 503);
    await none.close();
  });
});
