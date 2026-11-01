/**
 * LeadFlow CRM — servidor
 *
 *  - Serve a interface (pasta dist/ gerada pelo `npm run build`) com fallback de SPA.
 *  - GET  /api/health    → status do servidor e se a IA está configurada.
 *  - POST /api/ai/reply  → gera a resposta do agente de IA (a chave fica só aqui).
 *
 * Variáveis de ambiente: veja .env.example na raiz do projeto.
 */
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const here = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(here, '..', 'dist'));
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
const AI_PROVIDER = (process.env.AI_PROVIDER ?? 'anthropic').toLowerCase();
const AI_API_KEY = process.env.AI_API_KEY ?? '';
const AI_MODEL = process.env.AI_MODEL ?? (AI_PROVIDER === 'openai' ? 'gpt-4o-mini' : 'claude-haiku-5-5');

const anthropic = AI_PROVIDER === 'anthropic' && AI_API_KEY ? new Anthropic({ apiKey: AI_API_KEY, maxRetries: 2, timeout: 60_000 }) : null;

// ------------------------------------------------------------------ utilidades
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readJson(req, limit = 512 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('payload muito grande'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

// Limite simples por IP: 60 requisições de IA por minuto
const buckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const b = buckets.get(ip) ?? { count: 0, reset: now + 60_000 };
  if (now > b.reset) Object.assign(b, { count: 0, reset: now + 60_000 });
  b.count++;
  buckets.set(ip, b);
  return b.count > 60;
}

/** No modo Supabase só usuários logados podem usar a IA; sem Supabase, só localhost (desenvolvimento). */
async function authorized(req) {
  if (!SUPABASE_URL) {
    const ip = req.socket.remoteAddress ?? '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  }
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { authorization: auth, apikey: SUPABASE_ANON_KEY } });
    return r.ok;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ IA
const TONES = {
  amigavel: 'amigável e acolhedor',
  profissional: 'profissional e cordial',
  descontraido: 'descontraído, pode usar emojis com moderação',
  objetivo: 'direto e objetivo',
};
const HANDOFF = '[TRANSFERIR]';

function buildSystem({ agent, company, contactName, knowledge = [], products = [] }) {
  const kb = knowledge.map((k) => `### ${k.title}\n${k.content}`).join('\n\n') || '(vazia)';
  const catalog = products.map((p) => `- ${p.name}: R$ ${Number(p.price).toFixed(2).replace('.', ',')} — ${p.description}`).join('\n') || '(sem produtos)';
  return [
    `Você é "${agent.name}", atendente virtual da empresa ${company} no WhatsApp.`,
    agent.objective ? `Objetivo: ${agent.objective}` : '',
    `Tom de voz: ${TONES[agent.tone] ?? 'cordial'}.`,
    `Instruções do negócio:\n${agent.prompt}`,
    agent.qualification?.length ? `Perguntas de qualificação (faça uma de cada vez, quando fizer sentido):\n${agent.qualification.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : '',
    `Desconto máximo que você pode oferecer: ${agent.maxDiscount ?? 0}%. Pedidos acima disso vão para um vendedor.`,
    `Base de conhecimento (use somente estas informações; nunca invente preços, prazos ou políticas):\n${kb}`,
    `Catálogo de produtos e preços de referência:\n${catalog}`,
    contactName ? `Nome do cliente: ${contactName}.` : '',
    [
      'Regras de formato:',
      '- Responda em português do Brasil, como uma mensagem de WhatsApp: curta (até 3 frases), sem markdown de títulos ou listas longas.',
      '- Para negrito use *texto* (padrão do WhatsApp).',
      `- Se o cliente pedir um humano, demonstrar irritação, fizer uma pergunta que a base não responde, ou pedir desconto acima do limite, escreva uma frase avisando que vai transferir e termine a mensagem com ${HANDOFF}.`,
      agent.handoffKeywords?.length ? `- Palavras que indicam pedido de humano: ${agent.handoffKeywords.join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Histórico no formato da API: começa em "user" e termina em "user". */
function toMessages(history) {
  const msgs = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

function finish(text) {
  const handoff = text.includes(HANDOFF);
  return { text: text.replaceAll(HANDOFF, '').trim(), handoff };
}

async function replyAnthropic(body) {
  const messages = toMessages(body.history ?? []);
  if (!messages.length || messages[messages.length - 1].role !== 'user') throw Object.assign(new Error('histórico precisa terminar com mensagem do cliente'), { status: 400 });
  const requested = String(body.agent?.model ?? '');
  const model = requested.startsWith('claude-') ? requested : AI_MODEL;
  // Opus/Sonnet: se o modelo recusar por segurança, a API tenta outro modelo automaticamente
  const withFallback = model === 'claude-opus-5-5' || model === 'claude-sonnet-5-5';

  const params = {
    model,
    max_tokens: 4096,
    system: buildSystem(body),
    messages,
    cache_control: { type: 'ephemeral' },
    // atendimento por chat: esforço baixo = respostas rápidas e baratas
    output_config: { effort: 'low' },
  };
  const response = withFallback
    ? await anthropic.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await anthropic.messages.create(params);

  if (response.stop_reason === 'refusal') {
    return { text: 'Vou te passar para um atendente da equipe, só um instante 🙂', handoff: true };
  }
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) return { text: 'Vou chamar alguém da equipe para te ajudar 🙂', handoff: true };
  return finish(text);
}

async function replyOpenAI(body) {
  const messages = toMessages(body.history ?? []);
  const requested = String(body.agent?.model ?? '');
  const model = requested.startsWith('gpt-') ? requested : AI_MODEL;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${AI_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: Math.min(1, Math.max(0, Number(body.agent?.temperature ?? 0.4))),
      max_tokens: 600,
      messages: [{ role: 'system', content: buildSystem(body) }, ...messages],
    }),
  });
  if (!r.ok) throw Object.assign(new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: 502 });
  const j = await r.json();
  return finish(j.choices?.[0]?.message?.content ?? '');
}

async function handleAiReply(req, res) {
  if (!AI_API_KEY) return send(res, 503, { error: 'AI_API_KEY não configurada no servidor' });
  if (!(await authorized(req))) return send(res, 401, { error: 'não autorizado' });
  if (rateLimited(req.socket.remoteAddress ?? 'x')) return send(res, 429, { error: 'muitas requisições, aguarde um minuto' });
  try {
    const body = await readJson(req);
    if (!body.agent?.prompt) return send(res, 400, { error: 'agente inválido' });
    const out = AI_PROVIDER === 'openai' ? await replyOpenAI(body) : await replyAnthropic(body);
    send(res, 200, out);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'limite da API de IA atingido' });
    if (err instanceof Anthropic.AuthenticationError) return send(res, 502, { error: 'chave de IA inválida' });
    if (err instanceof Anthropic.BadRequestError) return send(res, 502, { error: `requisição recusada pela API: ${err.message}` });
    if (err instanceof Anthropic.APIError) return send(res, 502, { error: `erro da API de IA (${err.status})` });
    console.error('[ai/reply]', err);
    send(res, err.status ?? 500, { error: err.message ?? 'erro interno' });
  }
}

// ------------------------------------------------------------------ estáticos
function serveStatic(req, res) {
  const url = new URL(req.url ?? '/', 'http://x');
  const safe = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(STATIC_DIR, safe);
  if (!file.startsWith(STATIC_DIR) || !existsSync(file) || statSync(file).isDirectory()) file = join(STATIC_DIR, 'index.html');
  if (!existsSync(file)) return send(res, 404, { error: 'build não encontrado — rode npm run build' });
  const isAsset = file.includes(`${join(STATIC_DIR, 'assets')}`);
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
  });
  createReadStream(file).pipe(res);
}

// ------------------------------------------------------------------ servidor
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://x');
  if (pathname === '/api/health') return send(res, 200, { ok: true, ai: Boolean(AI_API_KEY), provider: AI_PROVIDER, supabase: Boolean(SUPABASE_URL) });
  if (pathname === '/api/ai/reply' && req.method === 'POST') return handleAiReply(req, res);
  if (pathname.startsWith('/api/')) return send(res, 404, { error: 'rota não encontrada' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'método não permitido' });
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`LeadFlow CRM no ar em http://localhost:${PORT}`);
  console.log(`IA: ${AI_API_KEY ? `${AI_PROVIDER} (${AI_MODEL})` : 'não configurada — agentes usam o motor local'}`);
  console.log(`Supabase: ${SUPABASE_URL ? 'configurado' : 'não configurado (modo local)'}`);
});
