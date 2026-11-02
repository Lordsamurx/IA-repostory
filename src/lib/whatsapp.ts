/**
 * Ponte entre o WhatsApp real (gateway) e a store do CRM.
 *
 * Roda no worker do servidor: o webhook do gateway vira contato + conversa + mensagem,
 * e as mensagens de saída que ainda não foram entregues formam a "caixa de saída".
 * Nada aqui fala com a rede; quem envia de fato é o servidor (server/whatsapp.mjs).
 */
import { useStore } from '../store/useStore';
import type { Connection, Conversation, LeadSource, Message, MessageKind } from '../types';
import { agentForConnection } from './ai';
import { isWindowOpen, nowIso, onlyDigits, uid } from './utils';

/**
 * Chave de comparação de telefone. No Brasil o WhatsApp às vezes entrega o celular sem
 * o nono dígito (55 31 9xxxx-xxxx → 55 31 xxxx-xxxx); os dois formatos viram a mesma chave.
 */
export function phoneKey(phone: string) {
  const d = onlyDigits(phone);
  return d.length === 13 && d.startsWith('55') && d[4] === '9' ? d.slice(0, 4) + d.slice(5) : d;
}

/**
 * Abre a conversa de um lead que acabou de escrever: chatbot de menu ou agente de IA
 * conforme a conexão, negócio na 1ª etapa do funil (só para contato novo) e aviso à equipe.
 */
export function openInboundConversation(contactId: string, conn: Connection | undefined, opts: { source: LeadSource; newDeal: boolean }) {
  const st = useStore.getState();
  const contact = st.contacts.find((c) => c.id === contactId);
  const hasBot = conn ? st.chatbots.some((b) => b.active && b.trigger === 'primeira_mensagem' && b.connectionIds.includes(conn.id)) : false;
  const agent = conn && !hasBot ? agentForConnection(conn.id) : undefined;
  const conv: Conversation = {
    id: uid('cnv-'),
    contactId,
    connectionId: conn?.id ?? '',
    status: 'aguardando',
    departmentId: conn?.departmentId,
    aiEnabled: Boolean(agent),
    agentId: agent?.id,
    unread: 0,
    pinned: false,
    lastMessageAt: nowIso(),
    aiReplies: 0,
  };
  st.add('conversations', conv);

  const pipeline = st.pipelines[0];
  if (opts.newDeal && pipeline?.stages[0]) {
    st.add('deals', {
      id: uid('dea-'),
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      contactId,
      title: `Oportunidade — ${contact?.name ?? ''}`,
      value: 0,
      productIds: [],
      status: 'aberto',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
  st.add('notifications', {
    id: uid('ntf-'),
    title: opts.newDeal ? `Novo lead · ${opts.source}` : 'Nova conversa',
    body: `${contact?.name ?? 'Um contato'} iniciou uma conversa.`,
    createdAt: nowIso(),
    read: false,
    link: `/inbox/${conv.id}`,
  });
  return conv.id;
}

/** Mensagem recebida do gateway, já normalizada (ver server/whatsapp.mjs → parseWebhook). */
export interface InboundMessage {
  instance: string;
  id: string;
  fromMe: boolean;
  phone: string;
  name?: string;
  text: string;
  kind: MessageKind;
  at?: string;
}

export type InboundResult = 'ok' | 'duplicate' | 'unknown_connection' | 'ignored';

/** Conversa que deve receber a mensagem: pesquisa NPS ou disparo pendente > conversa aberta. */
function conversationForContact(contactId: string) {
  const convs = useStore
    .getState()
    .conversations.filter((c) => c.contactId === contactId)
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return convs.find((c) => c.npsPending || c.broadcastId) ?? convs.find((c) => c.status !== 'finalizado');
}

export function receiveWhatsApp(m: InboundMessage): InboundResult {
  const st = useStore.getState();
  const conn = st.connections.find((c) => c.instance === m.instance);
  if (!conn) return 'unknown_connection';
  if (m.id && st.messages.some((x) => x.externalId === m.id)) return 'duplicate';

  const key = phoneKey(m.phone);
  let contact = st.contacts.find((c) => c.phone && phoneKey(c.phone) === key);

  if (m.fromMe) {
    // enviada pelo próprio celular (fora do CRM): entra no histórico, sem disparar automação
    if (!contact) return 'ignored';
    const conv = conversationForContact(contact.id) ?? st.conversations.filter((c) => c.contactId === contact!.id).at(-1);
    if (!conv) return 'ignored';
    // eco do que o próprio CRM enviou (o webhook pode chegar antes da resposta do envio)
    const recent = Date.now() - 120_000;
    if (st.messages.some((x) => x.conversationId === conv.id && x.direction === 'out' && x.body === m.text && new Date(x.createdAt).getTime() > recent)) {
      return 'duplicate';
    }
    const at = m.at ?? nowIso();
    st.add('messages', {
      id: uid('msg-'),
      conversationId: conv.id,
      direction: 'out',
      kind: m.kind,
      body: m.text,
      author: 'system',
      createdAt: at,
      status: 'sent',
      externalId: m.id,
      delivery: 'sent',
    });
    useStore.getState().update('conversations', conv.id, { lastMessageAt: at });
    return 'ok';
  }

  let isNew = false;
  if (!contact) {
    contact = st.createContact({ name: m.name?.trim() || `+${onlyDigits(m.phone)}`, phone: onlyDigits(m.phone), source: 'WhatsApp', tagIds: [] });
    isNew = true;
  }
  const convId = conversationForContact(contact.id)?.id ?? openInboundConversation(contact.id, conn, { source: 'WhatsApp', newDeal: isNew });
  useStore.getState().receiveMessage(convId, m.text, m.kind, { externalId: m.id || undefined });
  return 'ok';
}

const STATUS_ORDER: Message['status'][] = ['sent', 'delivered', 'read'];

/** Confirmação de entrega/leitura vinda do gateway. Nunca volta um status para trás. */
export function applyAck(id: string, status: Message['status']) {
  const st = useStore.getState();
  const msg = st.messages.find((m) => m.externalId === id);
  if (!msg || STATUS_ORDER.indexOf(status) <= STATUS_ORDER.indexOf(msg.status)) return false;
  st.update('messages', msg.id, { status });
  return true;
}

/** Falha de envio informada depois pelo WhatsApp (API oficial: o envio é aceito e recusado no webhook). */
export function applyFailure(id: string, error: string) {
  const msg = useStore.getState().messages.find((m) => m.externalId === id);
  if (!msg || msg.delivery === 'failed') return false;
  markFailed(msg.id, error);
  return true;
}

/** Estado da conexão informado pelo gateway (QR lido, celular desconectado, etc.). */
export function applyConnectionState(instance: string, state: 'open' | 'close' | 'connecting', phone?: string) {
  const st = useStore.getState();
  const conn = st.connections.find((c) => c.instance === instance);
  if (!conn) return false;
  const status: Connection['status'] = state === 'open' ? 'conectado' : state === 'connecting' ? 'aguardando_qr' : 'desconectado';
  const digits = phone ? onlyDigits(phone) : '';
  if (conn.status === status && (!digits || conn.phone === digits)) return false;
  st.update('connections', conn.id, { status, ...(digits ? { phone: digits } : {}) });
  return true;
}

export interface OutboundItem {
  messageId: string;
  instance: string;
  phone: string;
  text: string;
  /** API oficial: template aprovado pela Meta, enviado no lugar do texto. */
  template?: { name: string; lang: string };
}

const SENDABLE: MessageKind[] = ['text'];

/**
 * Caixa de saída: mensagens de saída em conexões reais que ainda não foram enviadas.
 * Mensagens mais antigas que `maxAgeMs` são ignoradas, para que um servidor que ficou
 * fora do ar não dispare mensagens velhas ao voltar.
 */
export function pendingOutbound(maxAgeMs: number, now = Date.now()): OutboundItem[] {
  const st = useStore.getState();
  const out: OutboundItem[] = [];
  const failed: [string, string][] = [];
  for (const m of st.messages) {
    if (m.direction !== 'out' || m.kind === 'note' || m.kind === 'system' || m.externalId || m.delivery) continue;
    if (now - new Date(m.createdAt).getTime() > maxAgeMs) continue;
    const conv = st.conversations.find((c) => c.id === m.conversationId);
    const conn = conv && st.connections.find((c) => c.id === conv.connectionId);
    if (!conv || !conn?.instance) continue; // conexão simulada: nada a enviar
    const contact = st.contacts.find((c) => c.id === conv.contactId);
    if (conn.status !== 'conectado') failed.push([m.id, 'WhatsApp desconectado: reconecte em Conexões e envie de novo']);
    else if (!contact?.phone) failed.push([m.id, 'Contato sem telefone']);
    else if (!SENDABLE.includes(m.kind)) failed.push([m.id, 'Envio de arquivos pelo WhatsApp ainda não está disponível']);
    else if (conn.type === 'api_oficial' && m.templateName)
      out.push({ messageId: m.id, instance: conn.instance, phone: onlyDigits(contact.phone), text: m.body, template: { name: m.templateName, lang: m.templateLang ?? 'pt_BR' } });
    // a Meta só aceita texto livre até 24 h depois da última mensagem do cliente
    else if (conn.type === 'api_oficial' && !isWindowOpen(st.messages, conv.id, now)) failed.push([m.id, 'Janela de 24 h fechada: envie um template aprovado pela Meta']);
    else out.push({ messageId: m.id, instance: conn.instance, phone: onlyDigits(contact.phone), text: m.body });
  }
  for (const [id, error] of failed) markFailed(id, error);
  return out;
}

export function markSent(messageId: string, externalId: string | undefined) {
  useStore.getState().update('messages', messageId, { delivery: 'sent', externalId, deliveryError: undefined });
}

export function markFailed(messageId: string, error: string) {
  useStore.getState().update('messages', messageId, { delivery: 'failed', deliveryError: error.slice(0, 300) });
}
