// Testes: health, SPA, cabeçalhos de segurança e path traversal.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appServer, makeDist, rawGet } from '../support/helpers.mjs';

describe('health e cabeçalhos', () => {
  let app;
  let dist;
  before(async () => {
    dist = makeDist();
    app = await appServer({ staticDir: dist.dist });
  });
  after(async () => {
    await app.close();
    dist.cleanup();
  });

  it('GET /api/health responde 200 sem chave de IA', async () => {
    const r = await fetch(`${app.url}/api/health`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual(j, { ok: true, ai: false, provider: 'anthropic', supabase: false, automation: false, whatsapp: false });
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  it('respostas trazem CSP, X-Frame-Options e demais cabeçalhos de segurança', async () => {
    const r = await fetch(`${app.url}/api/health`);
    const csp = r.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.match(r.headers.get('permissions-policy'), /camera=\(\)/);
  });

  it('CSP libera o Supabase (https e wss) quando a URL está configurada', async () => {
    const withSupa = await appServer({ staticDir: dist.dist, supabaseUrl: 'https://abc.supabase.co' });
    try {
      const r = await fetch(`${withSupa.url}/api/health`);
      const csp = r.headers.get('content-security-policy');
      assert.match(csp, /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co https:\/\/abc\.supabase\.co wss:\/\/abc\.supabase\.co/);
    } finally {
      await withSupa.close();
    }
  });

  it('o CSP não permite imagens remotas (só data: e blob:)', async () => {
    const r = await fetch(`${app.url}/`);
    assert.match(r.headers.get('content-security-policy'), /img-src 'self' data: blob:/);
  });
});

describe('servir a SPA', () => {
  let app;
  let dist;
  before(async () => {
    dist = makeDist();
    app = await appServer({ staticDir: dist.dist });
  });
  after(async () => {
    await app.close();
    dist.cleanup();
  });

  it('GET / devolve o index.html sem cache', async () => {
    const r = await fetch(`${app.url}/`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(await r.text(), /LeadFlow teste/);
    assert.equal(r.headers.get('cache-control'), 'no-cache');
  });

  it('assets em /assets têm cache imutável', async () => {
    const r = await fetch(`${app.url}/assets/app.js`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /javascript/);
    assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(r.headers.get('content-length'), String(Buffer.byteLength('console.log("app de teste");')));
  });

  it('rota desconhecida do front cai no index.html (fallback de SPA)', async () => {
    const r = await fetch(`${app.url}/inbox/cnv-123`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /LeadFlow teste/);
  });

  it('HEAD responde sem corpo', async () => {
    const r = await fetch(`${app.url}/`, { method: 'HEAD' });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), '');
  });

  it('rota /api desconhecida responde 404 em JSON', async () => {
    const r = await fetch(`${app.url}/api/nao-existe`);
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { error: 'rota não encontrada' });
  });

  it('método não permitido em páginas responde 405', async () => {
    const r = await fetch(`${app.url}/`, { method: 'PUT', body: 'x' });
    assert.equal(r.status, 405);
  });
});

describe('path traversal', () => {
  let app;
  let dist;
  before(async () => {
    dist = makeDist();
    app = await appServer({ staticDir: dist.dist });
  });
  after(async () => {
    await app.close();
    dist.cleanup();
  });

  const attacks = [
    '/../segredo.txt',
    '/../../segredo.txt',
    '/assets/../../segredo.txt',
    '/%2e%2e/segredo.txt',
    '/%2e%2e%2fsegredo.txt',
    '/..%2fsegredo.txt',
    '/..%5csegredo.txt',
    '/%252e%252e/segredo.txt',
    '/..\\segredo.txt',
  ];

  for (const path of attacks) {
    it(`não vaza arquivo fora de dist/: ${path}`, async () => {
      const r = await rawGet(app.port, path);
      assert.ok(!r.body.includes('SEGREDO-DO-SERVIDOR'), `vazou o conteúdo com o caminho ${path}`);
    });
  }

  it('caminho com byte inválido responde 400 e o servidor continua de pé', async () => {
    const r = await rawGet(app.port, '/%E0%A4%A');
    assert.equal(r.status, 400);
    const h = await fetch(`${app.url}/api/health`);
    assert.equal(h.status, 200);
  });

  it('caminho com byte nulo responde 400', async () => {
    const r = await rawGet(app.port, '/%00index.html');
    assert.equal(r.status, 400);
  });
});
