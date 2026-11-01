/**
 * Chatbot de menu (URA de WhatsApp): envia as opções numeradas,
 * interpreta a resposta do cliente e executa a ação da opção escolhida.
 */
import { useStore } from '../store/useStore';
import type { ChatbotFlow, Conversation, Message } from '../types';
import { fillTemplate, firstName, normalize, nowIso, uid } from './utils';

export function menuText(flow: ChatbotFlow, vars: Record<string, string>) {
  const lines = flow.options.map((o) => `*${o.key}* - ${o.label}`).join('\n');
  return `${fillTemplate(flow.greeting, vars)}\n\n${lines}`;
}

/** Fluxo que deve iniciar numa conversa nova daquela conexão */
export function botForConnection(connectionId: string) {
  return useStore.getState().chatbots.find((b) => b.active && b.trigger === 'primeira_mensagem' && b.connectionIds.includes(connectionId));
}

function vars(conv: Conversation) {
  const st = useStore.getState();
  const contact = st.contacts.find((c) => c.id === conv.contactId);
  return { nome: contact ? firstName(contact.name) : '', empresa: st.settings.companyName };
}

function startFlow(conv: Conversation, flow: ChatbotFlow) {
  const st = useStore.getState();
  st.sendMessage(conv.id, menuText(flow, vars(conv)), { author: 'bot' });
  st.update('conversations', conv.id, { bot: { flowId: flow.id, attempts: 0 }, aiEnabled: false });
  st.update('chatbots', flow.id, { runs: flow.runs + 1 });
}

function applyOption(conv: Conversation, flow: ChatbotFlow, key: string) {
  const st = useStore.getState();
  const opt = flow.options.find((o) => o.key === key)!;
  if (opt.reply.trim()) st.sendMessage(conv.id, fillTemplate(opt.reply, vars(conv)), { author: 'bot' });
  st.update('conversations', conv.id, { bot: undefined });

  const s2 = useStore.getState();
  switch (opt.action) {
    case 'transferir':
      if (opt.value) s2.transfer(conv.id, opt.value);
      break;
    case 'etiqueta': {
      const contact = s2.contacts.find((c) => c.id === conv.contactId);
      if (contact && opt.value && !contact.tagIds.includes(opt.value)) s2.update('contacts', contact.id, { tagIds: [...contact.tagIds, opt.value] });
      break;
    }
    case 'funil': {
      const pipeline = s2.pipelines.find((p) => p.stages.some((st2) => st2.id === opt.value));
      if (!pipeline || !opt.value) break;
      const existing = s2.deals.find((d) => d.contactId === conv.contactId && d.pipelineId === pipeline.id && d.status === 'aberto');
      if (existing) s2.moveDeal(existing.id, opt.value);
      else {
        const contact = s2.contacts.find((c) => c.id === conv.contactId);
        s2.add('deals', {
          id: uid('dea-'),
          pipelineId: pipeline.id,
          stageId: opt.value,
          contactId: conv.contactId,
          title: `${opt.label} — ${contact?.name ?? ''}`,
          value: 0,
          productIds: [],
          status: 'aberto',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      }
      s2.update('conversations', conv.id, { status: 'aguardando' });
      break;
    }
    case 'ia':
      s2.setAI(conv.id, true, opt.value);
      break;
    case 'finalizar':
      s2.setConversationStatus(conv.id, 'finalizado');
      break;
    default:
      break;
  }
}

/** Retorna true se o chatbot tratou a mensagem (a IA não deve responder). */
export function handleChatbot(conversationId: string, msg: Message): boolean {
  const st = useStore.getState();
  const conv = st.conversations.find((c) => c.id === conversationId);
  if (!conv || conv.status === 'finalizado') return false;

  // 1. Aguardando escolha do menu
  if (conv.bot) {
    const flow = st.chatbots.find((f) => f.id === conv.bot!.flowId);
    if (!flow) {
      st.update('conversations', conv.id, { bot: undefined });
      return false;
    }
    const text = normalize(msg.body.trim());
    const match =
      flow.options.find((o) => text === o.key || text.startsWith(`${o.key} `) || text.startsWith(`${o.key}-`)) ??
      flow.options.find((o) => text.length > 3 && normalize(o.label).includes(text));
    if (match) {
      applyOption(conv, flow, match.key);
    } else if (conv.bot.attempts >= 1) {
      // segunda resposta inválida: passa para humano
      st.sendMessage(conv.id, 'Vou chamar alguém da equipe para te ajudar 🙂', { author: 'bot' });
      st.update('conversations', conv.id, { bot: undefined, status: 'aguardando' });
    } else {
      st.sendMessage(conv.id, `${flow.invalidMessage}\n\n${flow.options.map((o) => `*${o.key}* - ${o.label}`).join('\n')}`, { author: 'bot' });
      st.update('conversations', conv.id, { bot: { flowId: flow.id, attempts: conv.bot.attempts + 1 } });
    }
    return true;
  }

  // Conversa já com humano ou IA: o chatbot não interfere
  if (conv.aiEnabled || (conv.status === 'em_atendimento' && conv.assigneeId)) return false;

  const text = normalize(msg.body);
  const msgs = st.messages.filter((m) => m.conversationId === conv.id && m.kind !== 'system');
  const isFirst = msgs.filter((m) => m.direction === 'out').length === 0 && msgs.filter((m) => m.direction === 'in').length === 1;

  const flow = st.chatbots.find(
    (f) =>
      f.active &&
      f.connectionIds.includes(conv.connectionId) &&
      ((f.trigger === 'primeira_mensagem' && isFirst) || f.keywords.some((k) => k && text.includes(normalize(k)))),
  );
  if (!flow) return false;
  startFlow(conv, flow);
  return true;
}

/** Simulação para a tela de edição (não grava nada) */
export function previewChatbot(flow: ChatbotFlow, answer: string | null) {
  const v = { nome: 'Maria', empresa: useStore.getState().settings.companyName };
  if (answer === null) return { messages: [menuText(flow, v)] };
  const t = normalize(answer.trim());
  const opt = flow.options.find((o) => t === o.key || t.startsWith(`${o.key} `)) ?? flow.options.find((o) => t.length > 3 && normalize(o.label).includes(t));
  if (!opt) return { messages: [flow.invalidMessage] };
  return { messages: opt.reply ? [fillTemplate(opt.reply, v)] : [], option: opt };
}
