/**
 * Motor dos Agentes de IA.
 *
 * 1. Se a API do servidor estiver no ar (/api/ai/reply) e com chave configurada,
 *    a resposta vem do modelo real (Anthropic ou OpenAI) — a chave fica só no servidor.
 * 2. Caso contrário usa o motor local: responde pela base de conhecimento,
 *    faz as perguntas de qualificação e transfere para humano quando precisa.
 */
import { useStore } from '../store/useStore';
import type { Agent, Conversation, KnowledgeItem, Message, Weekday } from '../types';
import { fillTemplate, firstName, money, normalize, nowIso, uid } from './utils';
import { supabase } from './supabase';

let serverAI: boolean | null = null;

export async function checkServerAI(): Promise<boolean> {
  if (serverAI !== null) return serverAI;
  try {
    const r = await fetch('/api/health', { signal: AbortSignal.timeout(2500) });
    const j = r.ok ? ((await r.json()) as { ai?: boolean }) : null;
    serverAI = Boolean(j?.ai);
  } catch {
    serverAI = false;
  }
  return serverAI;
}

const STOP = new Set(
  'a o os as de da do das dos e em no na nos nas um uma para pra por com que qual quais como voce voces vcs tem ter sobre isso esse essa eu me meu minha queria quero gostaria saber oi ola bom dia boa tarde noite ai la mais'.split(
    ' ',
  ),
);

const tokens = (s: string) =>
  normalize(s)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

function stem(w: string) {
  return w.replace(/(oes|aes|s)$/, '').slice(0, 6);
}

export function searchKnowledge(question: string, items: KnowledgeItem[]) {
  const q = new Set(tokens(question).map(stem));
  let best: { item: KnowledgeItem; score: number } | null = null;
  for (const item of items) {
    if (item.type === 'url') continue;
    const title = tokens(item.title).map(stem);
    const body = tokens(item.content).map(stem);
    let score = 0;
    for (const t of new Set(title)) if (q.has(t)) score += 2;
    for (const t of new Set(body)) if (q.has(t)) score += 0.5;
    if (!best || score > best.score) best = { item, score };
  }
  return best && best.score >= 2 ? best.item : null;
}

export function agentIsOnSchedule(agent: Agent, d = new Date()) {
  if (!agent.schedule.enabled) return true;
  const day = d.getDay() as Weekday;
  if (!agent.schedule.days.includes(day)) return false;
  const hm = d.toTimeString().slice(0, 5);
  const { start, end } = agent.schedule;
  return start <= end ? hm >= start && hm < end : hm >= start || hm < end;
}

/** Escolhe o agente que deve assumir uma conversa nova naquela conexão. */
export function agentForConnection(connectionId: string) {
  const { agents } = useStore.getState();
  return agents.find((a) => a.active && a.connectionIds.includes(connectionId) && agentIsOnSchedule(a));
}

function localReply(agent: Agent, conv: Conversation, history: Message[]): { text: string; handoff?: boolean } {
  const st = useStore.getState();
  const contact = st.contacts.find((c) => c.id === conv.contactId);
  const vars = { nome: contact ? firstName(contact.name) : '', empresa: st.settings.companyName };
  const kb = st.knowledge.filter((k) => agent.knowledgeIds.includes(k.id));
  const lastIn = [...history].reverse().find((m) => m.direction === 'in' && m.kind === 'text');
  const question = lastIn?.body ?? '';
  const aiMsgs = history.filter((m) => m.author === 'ai');
  const parts: string[] = [];

  if (aiMsgs.length === 0) parts.push(fillTemplate(agent.greeting, vars));

  // Preço de produto citado na mensagem
  const qn = normalize(question);
  const asksPrice = /(valor|preco|quanto|custa|orcamento|parcel)/.test(qn);
  const product = st.products.find(
    (p) => p.active && tokens(p.name).some((t) => t.length > 4 && qn.includes(t.slice(0, 6))),
  );
  const faq = searchKnowledge(question, kb);

  if (asksPrice && product) {
    parts.push(
      `${product.name} sai a partir de ${money(product.price)}. O valor final é confirmado na avaliação, e parcelamos no cartão 😉`,
    );
  } else if (faq) {
    parts.push(faq.content);
  } else if (aiMsgs.length > 0) {
    const asked = new Set(aiMsgs.map((m) => m.body));
    const nextQ = agent.qualification.find((q) => ![...asked].some((a) => a.includes(q)));
    if (nextQ) parts.push(nextQ);
    else return { text: fillTemplate(agent.handoff.message, vars), handoff: true };
  }

  if (aiMsgs.length === 0 && agent.qualification[0] && !faq && !(asksPrice && product)) {
    parts.push(agent.qualification[0]);
  }
  return { text: parts.join('\n\n') || fillTemplate(agent.handoff.message, vars), handoff: parts.length === 0 };
}

async function serverReply(agent: Agent, conv: Conversation, history: Message[]) {
  const st = useStore.getState();
  const contact = st.contacts.find((c) => c.id === conv.contactId);
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  const r = await fetch('/api/ai/reply', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({
      agent: {
        name: agent.name,
        prompt: fillTemplate(agent.prompt, { empresa: st.settings.companyName, nome: contact?.name ?? '' }),
        objective: agent.objective,
        tone: agent.tone,
        model: agent.model,
        temperature: agent.temperature,
        qualification: agent.qualification,
        maxDiscount: agent.maxDiscount,
        handoffKeywords: agent.handoff.keywords,
      },
      company: st.settings.companyName,
      contactName: contact?.name,
      knowledge: st.knowledge.filter((k) => agent.knowledgeIds.includes(k.id)).map((k) => ({ title: k.title, content: k.content })),
      products: st.products.filter((p) => p.active).map((p) => ({ name: p.name, price: p.price, description: p.description })),
      history: history
        .filter((m) => m.kind === 'text')
        .slice(-20)
        .map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.body })),
    }),
  });
  if (!r.ok) throw new Error(`API IA ${r.status}`);
  return (await r.json()) as { text: string; handoff?: boolean };
}

const running = new Set<string>();

export async function runAgent(conversationId: string) {
  if (running.has(conversationId)) return;
  const st = useStore.getState();
  const conv = st.conversations.find((c) => c.id === conversationId);
  if (!conv || !conv.aiEnabled || conv.status === 'finalizado') return;
  const agent = st.agents.find((a) => a.id === conv.agentId) ?? st.agents.find((a) => a.active);
  if (!agent || !agent.active) return;

  running.add(conversationId);
  try {
    const history = st.messages.filter((m) => m.conversationId === conversationId);
    const lastIn = [...history].reverse().find((m) => m.direction === 'in');
    const wantsHuman = lastIn && agent.handoff.keywords.some((k) => k && normalize(lastIn.body).includes(normalize(k)));

    st.setTyping(conversationId, true);
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 900));

    let reply: { text: string; handoff?: boolean };
    if (wantsHuman || conv.aiReplies >= agent.handoff.maxReplies) {
      const contact = st.contacts.find((c) => c.id === conv.contactId);
      reply = {
        text: fillTemplate(agent.handoff.message, { nome: contact ? firstName(contact.name) : '', empresa: st.settings.companyName }),
        handoff: true,
      };
    } else if (await checkServerAI()) {
      try {
        reply = await serverReply(agent, conv, history);
      } catch {
        reply = localReply(agent, conv, history);
      }
    } else {
      reply = localReply(agent, conv, history);
    }

    const fresh = useStore.getState().conversations.find((c) => c.id === conversationId);
    if (!fresh?.aiEnabled) return; // um humano assumiu enquanto a IA "digitava"

    useStore.getState().sendMessage(conversationId, reply.text, { author: 'ai' });

    if (reply.handoff) {
      const s2 = useStore.getState();
      s2.transfer(conversationId, agent.handoff.departmentId ?? fresh.departmentId ?? s2.departments[0]?.id ?? '');
      const contact = s2.contacts.find((c) => c.id === conv.contactId);
      s2.add('notifications', {
        id: uid('ntf-'),
        title: 'IA transferiu um atendimento',
        body: `${agent.name} transferiu ${contact?.name ?? 'um contato'} para a fila.`,
        createdAt: nowIso(),
        read: false,
        link: `/inbox/${conversationId}`,
      });
    }
  } finally {
    useStore.getState().setTyping(conversationId, false);
    running.delete(conversationId);
  }
}

/** Teste do agente no "playground" — não grava nada no CRM. */
export async function previewAgent(agent: Agent, history: { role: 'user' | 'assistant'; content: string }[]) {
  const now = nowIso();
  const fakeConv: Conversation = {
    id: 'preview',
    contactId: '',
    connectionId: '',
    status: 'em_atendimento',
    aiEnabled: true,
    unread: 0,
    pinned: false,
    lastMessageAt: now,
    aiReplies: history.filter((h) => h.role === 'assistant').length,
  };
  const msgs: Message[] = history.map((h, i) => ({
    id: `p${i}`,
    conversationId: 'preview',
    direction: h.role === 'user' ? 'in' : 'out',
    kind: 'text',
    body: h.content,
    author: h.role === 'user' ? 'contact' : 'ai',
    createdAt: now,
    status: 'read',
  }));
  const last = history[history.length - 1]?.content ?? '';
  if (agent.handoff.keywords.some((k) => k && normalize(last).includes(normalize(k)))) {
    return { text: fillTemplate(agent.handoff.message, { nome: 'Cliente', empresa: useStore.getState().settings.companyName }), handoff: true };
  }
  if (await checkServerAI()) {
    try {
      return await serverReply(agent, fakeConv, msgs);
    } catch {
      /* cai no motor local */
    }
  }
  return localReply(agent, fakeConv, msgs);
}
