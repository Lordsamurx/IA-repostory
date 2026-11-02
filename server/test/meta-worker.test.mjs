// Teste de ponta a ponta do worker com a API oficial da Meta: banco falso (PostgREST em memória)
// + Meta Cloud API falsa. Cobre a janela de 24 h, o envio de template e a falha avisada pelo webhook.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMeta, metaInstance } from '../meta.mjs';
import { fakeMeta, fakePostgrest } from '../support/helpers.mjs';

const bundle = fileURLToPath(new URL('../worker/automation.mjs', import.meta.url));
const skip = existsSync(bundle) ? false : 'rode `npm run build:worker` na raiz para gerar o worker';
const PHONE_ID = '1098765';
const INSTANCE = metaInstance(PHONE_ID);
const PHONE = '5531988887777';
const OLD_PHONE = '5531977776666';

const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();
const DAY = 24 * 60 * 60_000;
const rec = (collection, data) => ({ collection, id: data.id, data });
const seed = [
  rec('settings', { id: 'main', companyName: 'Odonto Teste', timezone: 'America/Sao_Paulo', onboarded: true }),
  rec('users', { id: 'usr-admin', name: 'Admin', email: 'admin@teste.com', role: 'admin', presence: 'offline', departmentIds: ['dep-1'], color: '#000' }),
  rec('departments', { id: 'dep-1', name: 'Comercial', color: '#000' }),
  rec('connections', { id: 'con-meta', name: 'Oficial', phone: '553133330000', type: 'api_oficial', status: 'conectado', departmentId: 'dep-1', color: '#000', createdAt: iso(5 * DAY), instance: INSTANCE }),
  rec('pipelines', { id: 'pip-1', name: 'Vendas', stages: [{ id: 'stg-1', name: 'Novo', color: '#000', probability: 10 }] }),
  // cliente antigo: última mensagem dele há 2 dias (janela de 24 h fechada)
  rec('contacts', { id: 'ctt-old', name: 'João Antigo', phone: OLD_PHONE, source: 'WhatsApp', tagIds: [], createdAt: iso(3 * DAY), customFields: {} }),
  rec('conversations', { id: 'cnv-old', contactId: 'ctt-old', connectionId: 'con-meta', status: 'em_atendimento', assigneeId: 'usr-admin', aiEnabled: false, unread: 0, pinned: false, lastMessageAt: iso(2 * DAY), aiReplies: 0 }),
  rec('messages', { id: 'msg-old-in', conversationId: 'cnv-old', direction: 'in', kind: 'text', body: 'Obrigado!', author: 'contact', createdAt: iso(2 * DAY), status: 'read', externalId: 'wamid.OLD' }),
  // a equipe escreveu agora: texto livre (deve falhar) e um template (deve sair)
  rec('messages', { id: 'msg-free', conversationId: 'cnv-old', direction: 'out', kind: 'text', body: 'Oi João, tudo bem?', author: 'usr-admin', createdAt: iso(1000), status: 'sent' }),
  rec('messages', { id: 'msg-tpl', conversationId: 'cnv-old', direction: 'out', kind: 'text', body: '[Template: retorno_consulta]', author: 'usr-admin', createdAt: iso(500), status: 'sent', templateName: 'retorno_consulta', templateLang: 'pt_BR' }),
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

describe('worker com a API oficial da Meta (ponta a ponta)', { skip }, () => {
  let db;
  let meta;
  let worker;

  before(async () => {
    db = await fakePostgrest(seed);
    meta = await fakeMeta({ phoneId: PHONE_ID });
    const client = createMeta({ token: meta.token, phoneId: PHONE_ID, baseUrl: meta.url });
    const { startWorker } = await import(pathToFileURL(bundle).href);
    worker = await startWorker({
      supabaseUrl: db.url,
      serviceKey: db.serviceKey,
      sendText: (instance, phone, text) => client.sendText(phone, text),
      sendTemplate: (instance, phone, name, lang) => client.sendTemplate(phone, name, lang),
      log: () => {},
    });
  });
  after(async () => {
    await worker?.stop();
    await meta?.close();
    await db?.close();
  });

  it('janela de 24 h fechada: texto livre falha sem envio, o template sai pela Meta', async () => {
    await waitFor(() => db.of('messages').find((m) => m.id === 'msg-tpl')?.externalId, 'template enviado e gravado');
    const free = await waitFor(() => db.of('messages').find((m) => m.id === 'msg-free' && m.delivery === 'failed'), 'texto livre recusado');
    assert.match(free.deliveryError, /Janela de 24 h fechada/);
    assert.deepEqual(meta.ctl.sent, [
      { messaging_product: 'whatsapp', recipient_type: 'individual', to: OLD_PHONE, type: 'template', template: { name: 'retorno_consulta', language: { code: 'pt_BR' } } },
    ]);
  });

  it('mensagem recebida pela Meta abre conversa nova na conexão oficial', async () => {
    const r = worker.ingest({ type: 'message', message: { instance: INSTANCE, id: 'wamid.IN1', fromMe: false, phone: PHONE, name: 'Maria', text: 'Oi!', kind: 'text' } });
    assert.equal(r, 'ok');
    await waitFor(() => db.of('conversations').some((c) => c.connectionId === 'con-meta' && c.id !== 'cnv-old'), 'conversa criada');
    assert.ok(db.of('contacts').some((c) => c.phone === PHONE && c.name === 'Maria'));
  });

  it('falha avisada depois pelo webhook marca a mensagem e não se repete', async () => {
    const id = db.of('messages').find((m) => m.id === 'msg-tpl').externalId;
    assert.equal(worker.ingest({ type: 'failed', id, error: 'Template não encontrado ou ainda não aprovado na Meta' }), true);
    assert.equal(worker.ingest({ type: 'failed', id, error: 'de novo' }), false);
    const tpl = await waitFor(() => db.of('messages').find((m) => m.id === 'msg-tpl' && m.delivery === 'failed'), 'falha gravada');
    assert.match(tpl.deliveryError, /Template não encontrado/);
  });
});
