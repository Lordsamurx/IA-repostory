/**
 * NPS (Net Promoter Score): a pesquisa é enviada ao finalizar o atendimento
 * e a primeira resposta numérica (0 a 10) do cliente é registrada.
 */
import { useStore } from '../store/useStore';
import type { Message, NpsResponse } from '../types';
import { firstName, fillTemplate, nowIso, uid } from './utils';

/** Retorna true se a mensagem era a resposta da pesquisa. */
export function handleNps(conversationId: string, msg: Message): boolean {
  const st = useStore.getState();
  const conv = st.conversations.find((c) => c.id === conversationId);
  if (!conv?.npsPending) return false;
  const match = msg.body.trim().match(/^(10|[0-9])(?:\D|$)/);
  if (!match) {
    // não respondeu com nota: encerra a pesquisa e segue o atendimento normal
    st.update('conversations', conv.id, { npsPending: false });
    return false;
  }
  const score = Number(match[1]);
  const comment = msg.body.trim().slice(match[1]!.length).replace(/^[\s,.\-–—:]+/, '').trim();
  st.add('npsResponses', {
    id: uid('nps-'),
    conversationId: conv.id,
    contactId: conv.contactId,
    userId: conv.assigneeId,
    score,
    comment: comment || undefined,
    createdAt: nowIso(),
  });
  const contact = st.contacts.find((c) => c.id === conv.contactId);
  st.sendMessage(conv.id, fillTemplate(st.settings.nps.thanks, { nome: contact ? firstName(contact.name) : '', empresa: st.settings.companyName }), { author: 'nps' });
  // a resposta da pesquisa não reabre o atendimento
  useStore.getState().update('conversations', conv.id, { npsPending: false, status: 'finalizado', unread: 0 });
  return true;
}

/** NPS = % promotores (9–10) − % detratores (0–6) */
export function npsScore(list: Pick<NpsResponse, 'score'>[]) {
  if (!list.length) return { nps: 0, promoters: 0, passives: 0, detractors: 0, total: 0 };
  const promoters = list.filter((r) => r.score >= 9).length;
  const detractors = list.filter((r) => r.score <= 6).length;
  const passives = list.length - promoters - detractors;
  return { nps: Math.round(((promoters - detractors) / list.length) * 100), promoters, passives, detractors, total: list.length };
}
