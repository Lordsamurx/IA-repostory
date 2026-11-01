// Teste de ponta a ponta do worker de automação (server/worker/automation.mjs, gerado por `npm run build:worker`):
// banco falso (PostgREST em memória) + Evolution falsa. Nada sai da máquina.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createEvolution } from '../whatsapp.mjs';
import { fakeEvolution, fakePostgrest } from '../support/helpers.mjs';

const bundle = fileURLToPath(new URL('../worker/automation.mjs', import.meta.url));
const skip = existsSync(bundle) ? false : 'rode `npm run build:worker` na raiz para gerar o worker';
const INSTANCE = 'leadflow-con-1';
const PHONE = '5531988887777';

const now = new Date().toISOString();
const rec = (collection, data) => ({ collection, id: data.id, data });
const seed = [
  rec('settings', { id: 'main', companyName: 'Odonto Teste', timezone: 'America/Sao_Paulo', onboarded: true }),
  rec('users', { id: 'usr-admin', name: 'Admin', email: 'admin@teste.com', role: 'admin', presence: 'offline', departmentIds: ['dep-1'], color: '#000' }),
  rec('departments', { id: 'dep-1', name: 'Comercial', color: '#000' }),
  rec('connections', { id: 'con-1', name: 'Atendimento', phone: '', type: 'qrcode', status: 'conectado', departmentId: 'dep-1', color: '#000', createdAt: now, instance: INSTANCE }),
  rec('pipelines', { id: 'pip-1', name: 'Vendas', stages: [{ id: 'stg-1', name: 'Novo', color: '#000', probability: 10 }] }),
  rec('chatbots', {
    id: 'bot-1',
    name: 'Menu',
    active: true,
    connectionIds: ['con-1'],
    trigger: 'primeira_mensagem',
    keywords: [],
    greeting: 'Olá {{nome}}! Bem-vindo à {{empresa}}.',
    options: [{ id: 'o1', key: '1', label: 'Orçamento', reply: 'Certo, já te ajudo!', action: 'ia', value: 'agt-1' }],
    invalidMessage: 'Não entendi.',
    runs: 0,
    createdAt: now,
  }),
  rec('agents', {
    id: 'agt-1',
    name: 'Ana',
    objective: '',
    tone: 'amigavel',
    prompt: 'Atenda a clínica.',
    greeting: 'Oi!',
    model: 'claude-haiku-5-5',
    temperature: 0.4,
    active: true,
    knowledgeIds: [],
    connectionIds: [],
    qualification: [],
    maxDiscount: 0,
    schedule: { enabled: false, start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5] },
    handoff: { keywords: ['humano'], maxReplies: 10, message: 'Vou chamar a equipe.' },
    createdAt: now,
  }),
];

async function waitFor(check, label, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = check();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail(`tempo esgotado esperando: ${label}`);
}

describe('worker de automação (ponta a ponta)', { skip }, () => {
  let db;
  let evo;
  let worker;
  const aiCalls = [];
  const logs = [];
  const message = (id, text, extra = {}) => ({ type: 'message', message: { instance: INSTANCE, id, fromMe: false, phone: PHONE, name: 'Maria Souza', text, kind: 'text', ...extra } });

  before(async () => {
    db = await fakePostgrest(seed);
    evo = await fakeEvolution();
    const client = createEvolution({ url: evo.url, apiKey: evo.apiKey });
    const { startWorker } = await import(pathToFileURL(bundle).href);
    worker = await startWorker({
      supabaseUrl: db.url,
      serviceKey: db.serviceKey,
      ai: async (body) => (aiCalls.push(body), { text: 'O clareamento custa R$ 890.' }),
      sendText: (instance, phone, text) => client.sendText(instance, phone, text),
      log: (...a) => logs.push(a.join(' ')),
    });
  });
  after(async () => {
    await worker?.stop();
    await evo?.close();
    await db?.close();
  });

  it('carrega o banco e reconhece a instância do WhatsApp', () => {
    assert.equal(worker.hasInstance(INSTANCE), true);
    assert.equal(worker.hasInstance('outra'), false);
  });

  it('primeira mensagem: cria contato, conversa e negócio, e o chatbot responde pelo WhatsApp', async () => {
    assert.equal(worker.ingest(message('IN-1', 'Oi, boa tarde')), 'ok');
    const sent = await waitFor(() => evo.ctl.sent[0], 'menu do chatbot enviado');
    assert.equal(sent.instance, INSTANCE);
    assert.equal(sent.number, PHONE);
    assert.match(sent.text, /^Olá Maria! Bem-vindo à Odonto Teste\./);
    assert.match(sent.text, /\*1\* - Orçamento/);

    await waitFor(() => db.of('messages').some((m) => m.externalId === 'WA-1' && m.delivery === 'sent'), 'id do WhatsApp gravado no banco');
    const [contact] = db.of('contacts');
    assert.deepEqual([contact.name, contact.phone, contact.source], ['Maria Souza', PHONE, 'WhatsApp']);
    assert.equal(db.of('deals').length, 1);
    assert.equal(db.of('conversations')[0].connectionId, 'con-1');
    assert.ok(db.of('messages').some((m) => m.direction === 'in' && m.externalId === 'IN-1'));
  });

  it('a mesma mensagem entregue duas vezes pelo gateway não duplica', () => {
    assert.equal(worker.ingest(message('IN-1', 'Oi, boa tarde')), 'duplicate');
  });

  it('número sem o nono dígito cai no mesmo contato', async () => {
    worker.ingest(message('IN-2', '1', { phone: '553188887777' }));
    await waitFor(() => evo.ctl.sent.some((s) => s.text === 'Certo, já te ajudo!'), 'resposta da opção do menu');
    assert.equal(db.of('contacts').length, 1);
  });

  it('com a IA ligada pela opção do menu, a próxima mensagem é respondida pelo modelo', async () => {
    worker.ingest(message('IN-3', 'quanto custa o clareamento?'));
    await waitFor(() => evo.ctl.sent.some((s) => s.text === 'O clareamento custa R$ 890.'), 'resposta da IA enviada');
    const last = aiCalls.at(-1);
    assert.equal(last.company, 'Odonto Teste');
    assert.equal(last.history.at(-1).content, 'quanto custa o clareamento?');
  });

  it('confirmação de leitura do WhatsApp atualiza o status da mensagem', async () => {
    // a última resposta (da IA) ainda não foi lida; as anteriores já contam como lidas porque o cliente respondeu
    const id = `WA-${evo.ctl.sent.length}`;
    await waitFor(() => db.of('messages').some((m) => m.externalId === id), 'id da resposta gravado');
    assert.equal(worker.ingest({ type: 'ack', id, status: 'delivered' }), true);
    assert.equal(worker.ingest({ type: 'ack', id, status: 'read' }), true);
    assert.equal(worker.ingest({ type: 'ack', id, status: 'delivered' }), false); // nunca volta atrás
    await waitFor(() => db.of('messages').find((m) => m.externalId === id)?.status === 'read', 'status lido no banco');
  });

  it('mensagem enviada pelo celular entra no histórico sem disparar automação', async () => {
    const before = evo.ctl.sent.length;
    assert.equal(worker.ingest(message('ME-1', 'Te ligo amanhã', { fromMe: true })), 'ok');
    await waitFor(() => db.of('messages').some((m) => m.externalId === 'ME-1'), 'mensagem do celular gravada');
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(evo.ctl.sent.length, before);
  });

  it('celular desconectado: a resposta automática fica marcada como falha, sem envio', async () => {
    assert.equal(worker.ingest({ type: 'connection', instance: INSTANCE, state: 'close' }), true);
    await waitFor(() => db.of('connections')[0].status === 'desconectado', 'conexão desconectada no banco');
    const before = evo.ctl.sent.length;
    worker.ingest(message('IN-4', 'e o implante?'));
    await waitFor(() => db.of('messages').some((m) => m.author === 'ai' && m.delivery === 'failed'), 'falha registrada');
    assert.equal(evo.ctl.sent.length, before);
    const failed = db.of('messages').find((m) => m.delivery === 'failed');
    assert.match(failed.deliveryError, /desconectado/);
  });

  it('reconectado (com número): o estado e o telefone da conexão são atualizados', async () => {
    worker.ingest({ type: 'connection', instance: INSTANCE, state: 'open', phone: '5531900001111' });
    await waitFor(() => db.of('connections')[0].status === 'conectado' && db.of('connections')[0].phone === '5531900001111', 'conexão aberta');
  });
});
