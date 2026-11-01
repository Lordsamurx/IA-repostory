// Testes: /api/ai/reply — autorização, validação, limites, rate limit e formato da requisição à Anthropic.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  AI_KEY,
  OUTSIDER_TOKEN,
  MEMBER_TOKEN,
  appServer,
  fakeAnthropic,
  fakeSupabase,
  makeDist,
  memberAuth,
  validBody,
} from '../support/helpers.mjs';

/** URL de referência: nenhuma requisição sem Bearer chega ao Supabase, então não há chamada de rede. */
const SUPA_REF = 'https://projeto-teste.supabase.co';

const post = (app, body, headers = {}) =>
  fetch(`${app.url}/api/ai/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('/api/ai/reply: pré-condições', () => {
  let dist;
  let app;
  before(async () => {
    dist = makeDist();
    app = await appServer({ staticDir: dist.dist, aiApiKey: '' });
  });
  after(async () => {
    await app.close();
    dist.cleanup();
  });

  it('sem AI_API_KEY responde 503', async () => {
    const r = await post(app, validBody(), memberAuth);
    assert.equal(r.status, 503);
  });
});

describe('/api/ai/reply: autorização com Supabase', () => {
  let dist;
  let anthropic;
  let supa;
  let app;
  before(async () => {
    dist = makeDist();
    anthropic = await fakeAnthropic();
    supa = await fakeSupabase();
    app = await appServer({
      staticDir: dist.dist,
      aiApiKey: AI_KEY,
      anthropicBaseUrl: anthropic.url,
      supabaseUrl: supa.url,
    });
  });
  after(async () => {
    await app.close();
    await anthropic.close();
    await supa.close();
    dist.cleanup();
  });

  it('sem Authorization responde 401 e não chama a IA', async () => {
    const before = anthropic.requests.length;
    const r = await post(app, validBody());
    assert.equal(r.status, 401);
    assert.equal(anthropic.requests.length, before);
  });

  it('token inválido responde 401', async () => {
    const r = await post(app, validBody(), { authorization: 'Bearer token-qualquer' });
    assert.equal(r.status, 401);
  });

  it('usuário autenticado mas fora da equipe responde 401', async () => {
    const r = await post(app, validBody(), { authorization: `Bearer ${OUTSIDER_TOKEN}` });
    assert.equal(r.status, 401);
  });

  it('membro da equipe recebe resposta 200', async () => {
    const r = await post(app, validBody(), memberAuth);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.handoff, false);
    assert.ok(j.text.length > 0);
  });

  it('o token válido fica em cache: o Supabase não é consultado a cada mensagem', async () => {
    const authBefore = supa.counts.auth;
    for (let i = 0; i < 3; i++) assert.equal((await post(app, validBody(), memberAuth)).status, 200);
    assert.equal(supa.counts.auth, authBefore, 'o Supabase foi consultado de novo com o token em cache');
  });

  it('a chave de IA nunca aparece na resposta enviada ao navegador', async () => {
    const r = await post(app, validBody(), memberAuth);
    const txt = await r.text();
    assert.ok(!txt.includes(AI_KEY));
    assert.ok(!txt.includes(MEMBER_TOKEN));
  });
});

describe('/api/ai/reply: validação do corpo', () => {
  let dist;
  let anthropic;
  let app;
  before(async () => {
    dist = makeDist();
    anthropic = await fakeAnthropic();
    app = await appServer({ staticDir: dist.dist, aiApiKey: AI_KEY, anthropicBaseUrl: anthropic.url });
  });
  after(async () => {
    await app.close();
    await anthropic.close();
    dist.cleanup();
  });

  // sem Supabase configurado, só o próprio computador (127.0.0.1) pode usar a IA
  it('sem Supabase, o acesso local (127.0.0.1) é liberado para desenvolvimento', async () => {
    const r = await post(app, validBody());
    assert.equal(r.status, 200);
  });

  it('JSON inválido responde 400', async () => {
    const r = await post(app, '{"agent": ', {});
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: 'JSON inválido' });
  });

  it('corpo que não é objeto responde 400', async () => {
    const r = await post(app, 'null');
    assert.equal(r.status, 400);
  });

  it('agente sem prompt responde 400', async () => {
    const r = await post(app, { agent: { name: 'x' }, history: [{ role: 'user', content: 'oi' }] });
    assert.equal(r.status, 400);
  });

  it('Content-Type diferente de JSON responde 415', async () => {
    const r = await fetch(`${app.url}/api/ai/reply`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(validBody()) });
    assert.equal(r.status, 415);
  });

  it('corpo grande (Content-Length declarado) responde 413', async () => {
    const r = await post(app, { agent: { prompt: 'x' }, history: [{ role: 'user', content: 'a'.repeat(300_000) }] });
    assert.equal(r.status, 413);
  });

  it('corpo grande sem Content-Length (chunked) é cortado: 413, ou conexão fechada pelo servidor', async () => {
    // o servidor pode fechar a conexão antes de o cliente terminar de enviar: aceitamos os dois desfechos
    const outcome = await new Promise((resolve) => {
      const req = http.request(
        { host: '127.0.0.1', port: app.port, method: 'POST', path: '/api/ai/reply', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } },
        (res) => {
          res.resume();
          res.on('end', () => resolve({ status: res.statusCode }));
        },
      );
      req.on('error', (e) => resolve({ error: e.code }));
      const chunk = 'a'.repeat(80_000);
      for (let i = 0; i < 6; i++) req.write(chunk);
      req.end();
    });
    if (outcome.status !== undefined) assert.equal(outcome.status, 413);
    else assert.ok(['ECONNRESET', 'EPIPE'].includes(outcome.error), `erro inesperado: ${outcome.error}`);
    // o servidor continua de pé
    assert.equal((await fetch(`${app.url}/api/health`)).status, 200);
  });

  it('a validação corta textos longos em vez de repassar tudo ao modelo', async () => {
    let seen = null;
    const a2 = await fakeAnthropic((body) => {
      seen = body;
      return undefined;
    });
    const app2 = await appServer({ staticDir: dist.dist, aiApiKey: AI_KEY, anthropicBaseUrl: a2.url });
    try {
      const knowledge = Array.from({ length: 10 }, (_, i) => ({ title: `Item ${i}`, content: 'x'.repeat(4000) }));
      const r = await post(app2, validBody({ knowledge, history: Array.from({ length: 42 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'oi '.repeat(1500) })).concat([{ role: 'user', content: 'fim' }]) }));
      assert.equal(r.status, 200);
      assert.ok(seen.system.length < 60_000, `base não foi cortada: system com ${seen.system.length} caracteres`);
      assert.ok(seen.messages.length <= 40);
      assert.ok(seen.messages.every((m) => m.content.length <= 4000));
    } finally {
      await app2.close();
      await a2.close();
    }
  });
});

describe('/api/ai/reply: rate limit', () => {
  let dist;
  let app;
  before(async () => {
    dist = makeDist();
    app = await appServer({ staticDir: dist.dist, aiApiKey: AI_KEY, rateLimitPerMinute: 3, supabaseUrl: SUPA_REF });
  });
  after(async () => {
    await app.close();
    dist.cleanup();
  });

  it('acima do limite responde 429 (mesmo sem autorização, para não gastar o Supabase)', async () => {
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await post(app, validBody())).status);
    assert.deepEqual(statuses, [401, 401, 401, 429]);
  });
});

describe('rate limit atrás do proxy (TRUST_PROXY)', () => {
  let dist;
  let app;
  before(async () => {
    dist = makeDist();
    app = await appServer({ staticDir: dist.dist, aiApiKey: AI_KEY, rateLimitPerMinute: 2, trustProxy: 1, supabaseUrl: SUPA_REF });
  });
  after(async () => {
    await app.close();
    dist.cleanup();
  });

  it('clientes diferentes atrás do mesmo proxy têm limites separados', async () => {
    const statuses = [];
    for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
      statuses.push((await post(app, validBody(), { 'x-forwarded-for': ip })).status);
    }
    assert.deepEqual(statuses, [401, 401, 401]);
  });

  it('o mesmo cliente (último IP do X-Forwarded-For) estoura o limite', async () => {
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await post(app, validBody(), { 'x-forwarded-for': '198.51.100.9' })).status);
    assert.deepEqual(statuses, [401, 401, 429]);
  });

  it('IP forjado no início do X-Forwarded-For não muda o cliente identificado', async () => {
    // o proxy acrescenta o IP real no fim; o começo pode ter sido enviado pelo próprio cliente
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await post(app, validBody(), { 'x-forwarded-for': `10.0.0.${i}, 198.51.100.77` })).status);
    assert.deepEqual(statuses, [401, 401, 429]);
  });
});

describe('rate limit sem proxy confiável', () => {
  let dist;
  let app;
  before(async () => {
    dist = makeDist();
    app = await appServer({ staticDir: dist.dist, aiApiKey: AI_KEY, rateLimitPerMinute: 2, trustProxy: 0, supabaseUrl: SUPA_REF });
  });
  after(async () => {
    await app.close();
    dist.cleanup();
  });

  it('X-Forwarded-For é ignorado quando TRUST_PROXY=0 (não dá para burlar o limite trocando o cabeçalho)', async () => {
    const statuses = [];
    for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
      statuses.push((await post(app, validBody(), { 'x-forwarded-for': ip })).status);
    }
    assert.deepEqual(statuses, [401, 401, 429]);
  });
});

describe('erros do provedor não vazam para o cliente', () => {
  let dist;
  let anthropic;
  let app;
  before(async () => {
    dist = makeDist();
    anthropic = await fakeAnthropic(() => ({
      status: 400,
      body: { type: 'error', error: { type: 'invalid_request_error', message: 'SEGREDO-INTERNO do provedor' } },
    }));
    app = await appServer({ staticDir: dist.dist, aiApiKey: AI_KEY, anthropicBaseUrl: anthropic.url });
  });
  after(async () => {
    await app.close();
    await anthropic.close();
    dist.cleanup();
  });

  it('erro 400 do provedor vira 502 genérico, sem a mensagem interna', async () => {
    const r = await post(app, validBody());
    assert.equal(r.status, 502);
    const txt = await r.text();
    assert.ok(!txt.includes('SEGREDO-INTERNO'), `mensagem interna vazou: ${txt}`);
  });
});
