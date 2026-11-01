/**
 * Apoio aos testes do servidor: servidores falsos (Anthropic e Supabase),
 * pasta dist temporária e criação do servidor em porta aleatória.
 * Nenhuma chamada sai da máquina e nenhuma chave real é usada.
 */
import http from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../index.mjs';

export const ANON_KEY = 'anon-de-teste';
export const AI_KEY = 'sk-ant-teste-falsa';
export const MEMBER_TOKEN = 'token-membro';
export const MEMBER_ID = 'usr-membro';
export const OUTSIDER_TOKEN = 'token-estranho';
export const OUTSIDER_ID = 'usr-estranho';

/** Sobe um servidor HTTP em porta aleatória e devolve { url, close, requests }. */
export function listen(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? safeJson(raw) : null;
    requests.push({ method: req.method, url: req.url, headers: req.headers, body, raw });
    handler(req, res, body);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        requests,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Imita a API de mensagens da Anthropic. `reply` pode ser uma função (body) => { status, body }. */
export async function fakeAnthropic(reply) {
  return listen((req, res, body) => {
    const custom = reply?.(body);
    if (custom) return json(res, custom.status, custom.body);
    json(res, 200, {
      id: 'msg_teste',
      type: 'message',
      role: 'assistant',
      model: body?.model ?? 'claude-haiku-5-5',
      content: [{ type: 'text', text: 'Olá! Posso ajudar com isso.' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  });
}

/**
 * Imita o Supabase Auth e o PostgREST com a regra da RLS:
 * só o membro da equipe enxerga a própria linha em `users`.
 */
export async function fakeSupabase() {
  const counts = { auth: 0, rest: 0 };
  const srv = await listen((req, res) => {
    const url = new URL(req.url, 'http://x');
    const auth = req.headers.authorization ?? '';
    if (url.pathname === '/auth/v1/user') {
      counts.auth++;
      if (auth === `Bearer ${MEMBER_TOKEN}`) return json(res, 200, { id: MEMBER_ID, email: 'membro@teste.com' });
      if (auth === `Bearer ${OUTSIDER_TOKEN}`) return json(res, 200, { id: OUTSIDER_ID, email: 'fora@teste.com' });
      return json(res, 401, { message: 'invalid JWT' });
    }
    if (url.pathname === '/rest/v1/rpc/crm_is_member' && req.method === 'POST') {
      counts.rest++;
      // como a função do banco: true só para quem está na equipe
      return json(res, 200, auth === `Bearer ${MEMBER_TOKEN}`);
    }
    json(res, 404, { message: 'rota não existe no fake' });
  });
  return { ...srv, counts };
}

/** Pasta dist temporária com index.html, um asset e um arquivo "secreto" fora dela. */
export function makeDist() {
  const root = mkdtempSync(join(tmpdir(), 'leadflow-teste-'));
  const dist = join(root, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>LeadFlow teste</title>');
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log("app de teste");');
  writeFileSync(join(root, 'segredo.txt'), 'SEGREDO-DO-SERVIDOR');
  return { dist, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** Cria (sem subir) o servidor do app com configuração de teste. */
export function appServer(overrides = {}) {
  const server = createServer({
    port: 0,
    staticDir: overrides.staticDir,
    supabaseUrl: '',
    supabaseAnonKey: ANON_KEY,
    aiProvider: 'anthropic',
    aiApiKey: '',
    aiModel: 'claude-haiku-5-5',
    trustProxy: 0,
    rateLimitPerMinute: 60,
    ...overrides,
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

/** Requisição HTTP "crua": o caminho não é normalizado (necessário para testar path traversal). */
export function rawGet(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET', headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

export const memberAuth = { authorization: `Bearer ${MEMBER_TOKEN}` };

export const validBody = (extra = {}) => ({
  agent: {
    name: 'Ana',
    prompt: 'Atenda clientes de uma clínica odontológica.',
    tone: 'amigavel',
    model: 'claude-haiku-5-5',
    qualification: ['Qual o seu nome?'],
    maxDiscount: 5,
    handoffKeywords: ['humano'],
  },
  company: 'Odonto Teste',
  contactName: 'Carlos',
  knowledge: [{ title: 'Horário', content: 'Atendemos de segunda a sexta, das 8h às 18h.' }],
  products: [{ name: 'Clareamento', price: 890, description: 'Laser' }],
  history: [{ role: 'user', content: 'Oi, quanto custa o clareamento?' }],
  ...extra,
});

export const ADMIN_TOKEN = 'token-admin';
export const ADMIN_ID = 'usr-admin';
export const adminAuth = { authorization: `Bearer ${ADMIN_TOKEN}` };
export const WEBHOOK_TOKEN = 'segredo-do-webhook-de-teste';

/** Supabase falso com três perfis: admin, membro (atendente) e estranho. */
export async function fakeSupabaseRoles() {
  const counts = { auth: 0, rest: 0 };
  const srv = await listen((req, res) => {
    const url = new URL(req.url, 'http://x');
    const auth = req.headers.authorization ?? '';
    if (url.pathname === '/auth/v1/user') {
      counts.auth++;
      if (auth === `Bearer ${ADMIN_TOKEN}`) return json(res, 200, { id: ADMIN_ID, email: 'admin@teste.com' });
      if (auth === `Bearer ${MEMBER_TOKEN}`) return json(res, 200, { id: MEMBER_ID, email: 'membro@teste.com' });
      if (auth === `Bearer ${OUTSIDER_TOKEN}`) return json(res, 200, { id: OUTSIDER_ID, email: 'fora@teste.com' });
      return json(res, 401, { message: 'invalid JWT' });
    }
    if (url.pathname === '/rest/v1/rpc/crm_is_member' && req.method === 'POST') {
      counts.rest++;
      return json(res, 200, auth === `Bearer ${MEMBER_TOKEN}` || auth === `Bearer ${ADMIN_TOKEN}`);
    }
    if (url.pathname === '/rest/v1/rpc/crm_is_admin' && req.method === 'POST') {
      counts.rest++;
      return json(res, 200, auth === `Bearer ${ADMIN_TOKEN}`);
    }
    json(res, 404, { message: 'rota não existe no fake' });
  });
  return { ...srv, counts };
}

/**
 * Evolution API falsa. `state` controla /connectionState; `exists` simula instância já criada.
 * Guarda as mensagens enviadas em `sent`.
 */
export async function fakeEvolution({ apiKey = 'evo-teste', state = 'close', exists = false } = {}) {
  const ctl = { state, exists, sent: [], failSend: false };
  const srv = await listen((req, res, body) => {
    const url = new URL(req.url, 'http://x');
    if (req.headers.apikey !== apiKey) return json(res, 401, { message: 'Unauthorized' });
    const p = url.pathname;
    if (p === '/instance/create' && req.method === 'POST') {
      if (ctl.exists) return json(res, 403, { status: 403, error: 'Forbidden', response: { message: ['This name is already in use.'] } });
      ctl.exists = true;
      return json(res, 201, { instance: { instanceName: body.instanceName, status: 'connecting' }, hash: 'h', qrcode: { code: '2@abc', base64: 'data:image/png;base64,QRCRIADO', count: 1 } });
    }
    if (p.startsWith('/webhook/set/') && req.method === 'POST') return json(res, 201, { webhook: body.webhook });
    if (p.startsWith('/instance/connectionState/')) return json(res, 200, { instance: { instanceName: p.split('/').pop(), state: ctl.state } });
    if (p.startsWith('/instance/connect/')) return json(res, 200, { pairingCode: null, code: '2@novo', base64: 'data:image/png;base64,QRNOVO', count: 2 });
    if (p.startsWith('/instance/logout/') && req.method === 'DELETE') return json(res, 200, { status: 'SUCCESS' });
    if (p.startsWith('/message/sendText/') && req.method === 'POST') {
      if (ctl.failSend) return json(res, 400, { status: 400, response: { message: [{ exists: false }] } });
      ctl.sent.push({ instance: p.split('/').pop(), ...body });
      return json(res, 201, { key: { remoteJid: `${body.number}@s.whatsapp.net`, fromMe: true, id: `WA-${ctl.sent.length}` }, status: 'PENDING' });
    }
    json(res, 404, { message: 'rota não existe no fake' });
  });
  return Object.assign(srv, { ctl, apiKey });
}

/**
 * PostgREST falso em memória para crm_records (select paginado, upsert e delete),
 * usado com a chave service_role de teste pelo worker.
 */
export async function fakePostgrest(seed = [], serviceKey = 'service-role-teste') {
  const rows = new Map(seed.map((r) => [`${r.collection}/${r.id}`, structuredClone(r)]));
  const srv = await listen((req, res, body) => {
    const url = new URL(req.url, 'http://x');
    if (req.headers.apikey !== serviceKey) return json(res, 401, { message: 'chave inválida' });
    if (url.pathname !== '/rest/v1/crm_records') return json(res, 404, { message: 'rota não existe no fake' });
    if (req.method === 'GET') {
      const all = [...rows.values()].sort((a, b) => (a.collection + a.id).localeCompare(b.collection + b.id));
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 1000);
      return json(res, 200, all.slice(offset, offset + limit));
    }
    if (req.method === 'POST') {
      for (const r of Array.isArray(body) ? body : [body]) rows.set(`${r.collection}/${r.id}`, structuredClone(r));
      res.writeHead(201);
      return res.end();
    }
    if (req.method === 'DELETE') {
      const c = url.searchParams.get('collection')?.replace(/^eq\./, '');
      const ids = (url.searchParams.get('id') ?? '').replace(/^in\.\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''));
      for (const id of ids) rows.delete(`${c}/${id}`);
      res.writeHead(204);
      return res.end();
    }
    json(res, 405, { message: 'método não suportado' });
  });
  const of = (collection) => [...rows.values()].filter((r) => r.collection === collection).map((r) => r.data);
  return Object.assign(srv, { rows, of, serviceKey });
}
