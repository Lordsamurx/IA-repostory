/**
 * Automações que rodam em segundo plano enquanto o CRM está aberto:
 *  - Chatbot de menu: atende a primeira mensagem e direciona o lead.
 *  - Agentes de IA: respondem automaticamente mensagens recebidas.
 *  - Follow-ups: reenvia mensagens para leads que pararam de responder.
 *  - Disparos e mensagens agendadas: enviam no horário marcado.
 *  - Simulador: gera mensagens de teste (útil antes de conectar o WhatsApp).
 */
import { useStore } from '../store/useStore';
import type { Conversation, LeadSource } from '../types';
import { agentForConnection, runAgent } from './ai';
import { handleChatbot } from './chatbot';
import { handleNps } from './nps';
import { tickBroadcasts, tickScheduled } from './broadcast';
import { nowIso, uid } from './utils';

let started = false;

export function startAutomation() {
  if (started) return;
  started = true;

  // A IA responde sempre que chega mensagem nova em conversa com agente ativo
  let lastCount = useStore.getState().messages.length;
  useStore.subscribe((s) => {
    if (s.messages.length <= lastCount) {
      lastCount = s.messages.length;
      return;
    }
    const fresh = s.messages.slice(lastCount);
    lastCount = s.messages.length;
    for (const m of fresh) {
      if (m.direction !== 'in') continue;
      // resposta de pesquisa NPS > chatbot > IA
      if (handleNps(m.conversationId, m)) continue;
      if (handleChatbot(m.conversationId, m)) continue;
      const conv = useStore.getState().conversations.find((c) => c.id === m.conversationId);
      if (conv?.aiEnabled) void runAgent(conv.id);
    }
  });

  const tick = () => {
    runFollowUps();
    tickBroadcasts();
    tickScheduled();
  };
  tick();
  setInterval(tick, 15_000);
}

/** Executa os passos de follow-up vencidos. Retorna quantas mensagens enviou. */
export function runFollowUps(): number {
  const st = useStore.getState();
  // No modo multiusuário só o administrador executa, para não duplicar envios
  const me = st.users.find((u) => u.id === st.sessionUserId);
  if (!me || me.role !== 'admin') return 0;
  const active = st.followUps.filter((f) => f.active && f.steps.length > 0);
  if (!active.length) return 0;

  let sent = 0;
  const byConv = new Map<string, typeof st.messages>();
  for (const m of st.messages) {
    if (m.kind === 'note' || m.kind === 'system') continue;
    const arr = byConv.get(m.conversationId);
    if (arr) arr.push(m);
    else byConv.set(m.conversationId, [m]);
  }

  for (const conv of st.conversations) {
    if (conv.status === 'finalizado') continue;
    const msgs = byConv.get(conv.id);
    const last = msgs?.[msgs.length - 1];
    if (!last || last.direction !== 'out') continue; // aguardando resposta do lead

    const elapsedMin = (Date.now() - new Date(last.createdAt).getTime()) / 60_000;
    let state = conv.followUp;
    if (!state) {
      // inscreve só conversas que acabaram de ficar sem resposta
      const f = active[0]!;
      if (elapsedMin >= f.steps[0]!.delayMinutes) continue;
      state = { followUpId: f.id, nextStep: 0 };
      st.update('conversations', conv.id, { followUp: state });
    }
    const flow = st.followUps.find((f) => f.id === state!.followUpId);
    if (!flow?.active) continue;
    const step = flow.steps[state.nextStep];
    if (!step) continue;
    if (elapsedMin < step.delayMinutes) continue;

    useStore.getState().sendMessage(conv.id, step.message, { author: 'followup' });
    const s2 = useStore.getState();
    s2.update('conversations', conv.id, { followUp: { followUpId: flow.id, nextStep: state.nextStep + 1 } });
    s2.update('followUps', flow.id, { sent: (s2.followUps.find((f) => f.id === flow.id)?.sent ?? 0) + 1 });
    sent++;
  }
  return sent;
}

// ------------------------------------------------------------------
// Simulador de mensagens (ambiente de testes)
// ------------------------------------------------------------------
const NAMES = ['Paula Mendes', 'Ricardo Alves', 'Fernanda Dias', 'Gustavo Prado', 'Aline Teixeira', 'Leonardo Brito', 'Tatiane Reis', 'Murilo Castro'];
const OPENERS = [
  'Oi! Vi o anúncio e queria saber o valor do clareamento',
  'Boa tarde, vocês fazem implante? Quanto custa?',
  'Olá, a avaliação é gratuita?',
  'Qual o endereço de vocês?',
  'Vocês atendem convênio?',
  'Oi, quero falar com um atendente por favor',
  'Quais as formas de pagamento?',
];

export function simulateIncomingLead(source: LeadSource = 'Meta Ads', connectionId?: string) {
  const st = useStore.getState();
  const name = NAMES[Math.floor(Math.random() * NAMES.length)]!;
  const conn = st.connections.find((c) => c.id === connectionId) ?? st.connections.find((c) => c.status === 'conectado') ?? st.connections[0];
  const contact = st.createContact({
    name,
    phone: `55319${Math.floor(80000000 + Math.random() * 19999999)}`,
    source,
    tagIds: [],
  });
  // Se houver chatbot de menu na conexão, ele atende primeiro; senão, o agente de IA
  const hasBot = conn ? st.chatbots.some((b) => b.active && b.trigger === 'primeira_mensagem' && b.connectionIds.includes(conn.id)) : false;
  const agent = conn && !hasBot ? agentForConnection(conn.id) : undefined;
  const conv: Conversation = {
    id: uid('cnv-'),
    contactId: contact.id,
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

  // Lead novo entra automaticamente na primeira etapa do funil principal
  const pipeline = st.pipelines[0];
  if (pipeline?.stages[0]) {
    st.add('deals', {
      id: uid('dea-'),
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      contactId: contact.id,
      title: `Oportunidade — ${name}`,
      value: 0,
      productIds: [],
      status: 'aberto',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
  st.add('notifications', {
    id: uid('ntf-'),
    title: `Novo lead · ${source}`,
    body: `${name} iniciou uma conversa.`,
    createdAt: nowIso(),
    read: false,
    link: `/inbox/${conv.id}`,
  });
  st.receiveMessage(conv.id, OPENERS[Math.floor(Math.random() * OPENERS.length)]!);
  return conv.id;
}

