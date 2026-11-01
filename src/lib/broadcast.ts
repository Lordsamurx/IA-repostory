/**
 * Disparos (envio em massa) com intervalo entre mensagens para reduzir risco de bloqueio.
 * O envio roda enquanto o CRM estiver aberto no navegador de um administrador.
 */
import { useStore } from '../store/useStore';
import type { Broadcast, Contact, Conversation } from '../types';
import { nowIso, uid } from './utils';

const running = new Set<string>();

export function audienceOf(b: Pick<Broadcast, 'audience'>, contacts: Contact[], deals: { contactId: string; stageId: string; status: string }[]) {
  const { tagIds, sources, stageIds } = b.audience;
  return contacts.filter((c) => {
    if (tagIds.length && !c.tagIds.some((t) => tagIds.includes(t))) return false;
    if (sources.length && !sources.includes(c.source)) return false;
    if (stageIds.length && !deals.some((d) => d.contactId === c.id && d.status === 'aberto' && stageIds.includes(d.stageId))) return false;
    return true;
  });
}

function conversationFor(contactId: string, connectionId: string, broadcastId: string): string {
  const st = useStore.getState();
  const open = st.conversations.find((c) => c.contactId === contactId && c.status !== 'finalizado');
  if (open) {
    st.update('conversations', open.id, { broadcastId });
    return open.id;
  }
  // Conversa nasce finalizada: só volta para a fila se o lead responder
  const conv: Conversation = {
    id: uid('cnv-'),
    contactId,
    connectionId,
    status: 'finalizado',
    aiEnabled: false,
    unread: 0,
    pinned: false,
    lastMessageAt: nowIso(),
    aiReplies: 0,
    broadcastId,
  };
  st.add('conversations', conv);
  return conv.id;
}

export function startBroadcast(id: string) {
  const st = useStore.getState();
  const b = st.broadcasts.find((x) => x.id === id);
  if (!b || running.has(id)) return;
  const recipients = b.recipients.length ? b.recipients : audienceOf(b, st.contacts, st.deals).map((c) => c.id);
  st.update('broadcasts', id, { status: 'enviando', recipients, startedAt: b.startedAt ?? nowIso() });
  running.add(id);

  const step = () => {
    const s = useStore.getState();
    const cur = s.broadcasts.find((x) => x.id === id);
    if (!cur || cur.status !== 'enviando') {
      running.delete(id);
      return;
    }
    if (cur.sent >= cur.recipients.length) {
      s.update('broadcasts', id, { status: 'concluido', finishedAt: nowIso() });
      s.toast(`Disparo "${cur.name}" concluído`);
      running.delete(id);
      return;
    }
    const contactId = cur.recipients[cur.sent]!;
    if (s.contacts.some((c) => c.id === contactId)) {
      const convId = conversationFor(contactId, cur.connectionId, id);
      useStore.getState().sendMessage(convId, cur.message, { author: 'broadcast' });
    }
    useStore.getState().update('broadcasts', id, { sent: cur.sent + 1 });
    // intervalo real configurado, com variação aleatória de ±30%
    const jitter = cur.intervalSec * (0.7 + Math.random() * 0.6);
    setTimeout(step, jitter * 1000);
  };
  step();
}

export function pauseBroadcast(id: string) {
  useStore.getState().update('broadcasts', id, { status: 'pausado' });
}

/** Retoma envios interrompidos e inicia os agendados que venceram. */
export function tickBroadcasts() {
  const st = useStore.getState();
  const me = st.users.find((u) => u.id === st.sessionUserId);
  if (!me || me.role !== 'admin') return;
  for (const b of st.broadcasts) {
    if (b.status === 'enviando' && !running.has(b.id)) startBroadcast(b.id);
    if (b.status === 'agendado' && b.scheduledAt && new Date(b.scheduledAt) <= new Date()) startBroadcast(b.id);
  }
}

/** Envia as mensagens agendadas que venceram. */
export function tickScheduled() {
  const st = useStore.getState();
  const due = st.scheduled.filter((m) => m.status === 'pendente' && new Date(m.sendAt) <= new Date());
  for (const m of due) {
    const conv = st.conversations.find((c) => c.id === m.conversationId);
    if (!conv) {
      st.update('scheduled', m.id, { status: 'cancelada' });
      continue;
    }
    // evita envio duplicado entre atendentes: só quem agendou (ou um admin) envia
    const me = st.users.find((u) => u.id === st.sessionUserId);
    if (m.createdBy && m.createdBy !== me?.id && me?.role !== 'admin') continue;
    st.update('scheduled', m.id, { status: 'enviada' });
    useStore.getState().sendMessage(m.conversationId, m.body, { author: m.createdBy ?? 'system' });
  }
}
