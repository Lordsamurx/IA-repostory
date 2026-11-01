import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  AUTOMATED_AUTHORS,
  type Contact,
  type Conversation,
  type ConversationStatus,
  type DealStatus,
  type Message,
  type MessageKind,
  type Settings,
  type User,
} from '../types';
import { type CollectionName, type DataState, demoState, emptyState } from '../data/seed';
import { firstName, fillTemplate, nowIso, pickColor, uid } from '../lib/utils';
import { checkAccountPassword, hashPassword } from '../lib/password';
import { isSupabaseMode } from '../lib/supabase';

type Item<C extends CollectionName> = DataState[C][number];

export interface Toast {
  id: string;
  text: string;
  tone: 'success' | 'error' | 'info';
}

interface SessionState {
  sessionUserId: string | null;
  /** Conversas em que a IA está "digitando" (não persistido) */
  typing: Record<string, boolean>;
  toasts: Toast[];
  /** true quando os dados remotos (Supabase) já foram carregados */
  hydrated: boolean;
}

interface Actions {
  // genéricas
  add: <C extends CollectionName>(c: C, item: Item<C>) => void;
  update: <C extends CollectionName>(c: C, id: string, patch: Partial<Item<C>>) => void;
  remove: <C extends CollectionName>(c: C, id: string) => void;
  replaceAll: (data: Partial<DataState>) => void;
  setSettings: (patch: Partial<Settings>) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;

  // sessão (modo local)
  loginLocal: (email: string, password: string) => Promise<boolean>;
  setSession: (userId: string | null) => void;
  logout: () => void;
  signupLocal: (p: { name: string; email: string; password: string; company: string }) => Promise<void>;
  resetDemo: () => void;

  // contatos
  createContact: (p: Omit<Contact, 'id' | 'createdAt' | 'color'>) => Contact;
  removeContact: (id: string) => void;

  // atendimento
  startConversation: (contactId: string, connectionId?: string) => string;
  sendMessage: (conversationId: string, body: string, opts?: { kind?: MessageKind; author?: string; fileName?: string }) => void;
  receiveMessage: (conversationId: string, body: string, kind?: MessageKind) => void;
  markRead: (conversationId: string) => void;
  assign: (conversationId: string, userId: string | undefined) => void;
  setConversationStatus: (conversationId: string, status: ConversationStatus) => void;
  transfer: (conversationId: string, departmentId: string, userId?: string) => void;
  setAI: (conversationId: string, enabled: boolean, agentId?: string) => void;
  setTyping: (conversationId: string, typing: boolean) => void;

  // funil
  moveDeal: (dealId: string, stageId: string) => void;
  setDealStatus: (dealId: string, status: DealStatus, lostReason?: string) => void;
}

export type Store = DataState & SessionState & Actions;

const sysMsg = (conversationId: string, body: string): Message => ({
  id: uid('msg-'),
  conversationId,
  direction: 'out',
  kind: 'system',
  body,
  author: 'system',
  createdAt: nowIso(),
  status: 'read',
});

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...(isSupabaseMode ? emptyState() : demoState()),
      sessionUserId: null,
      typing: {},
      toasts: [],
      hydrated: !isSupabaseMode,

      add: (c, item) => set((s) => ({ [c]: [...s[c], item] }) as Partial<Store>),
      update: (c, id, patch) =>
        set(
          (s) =>
            ({
              [c]: (s[c] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)),
            }) as Partial<Store>,
        ),
      remove: (c, id) =>
        set((s) => ({ [c]: (s[c] as { id: string }[]).filter((x) => x.id !== id) }) as Partial<Store>),
      replaceAll: (data) => set(data as Partial<Store>),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      toast: (text, tone = 'success') => {
        const id = uid();
        set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
        setTimeout(() => get().dismissToast(id), 3500);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      loginLocal: async (email, password) => {
        const u = get().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
        if (!u) return false;
        // contas antigas (senha em texto puro) recebem o hash no primeiro login
        const check = await checkAccountPassword(u, password);
        if (!check.ok) return false;
        set((s) => ({
          sessionUserId: u.id,
          users: s.users.map((x) =>
            x.id === u.id ? { ...x, presence: 'online', passwordHash: check.passwordHash ?? x.passwordHash, password: undefined } : x,
          ),
        }));
        return true;
      },
      setSession: (userId) => set({ sessionUserId: userId }),
      logout: () => {
        const id = get().sessionUserId;
        set((s) => ({
          sessionUserId: null,
          users: s.users.map((x) => (x.id === id ? { ...x, presence: 'offline' } : x)),
        }));
      },
      signupLocal: async ({ name, email, password, company }) => {
        const admin: User = {
          id: uid('usr-'),
          name,
          email,
          passwordHash: await hashPassword(password),
          role: 'admin',
          presence: 'online',
          departmentIds: ['dep-comercial'],
          color: pickColor(name),
        };
        set({ ...emptyState({ companyName: company, onboarded: false }, admin), sessionUserId: admin.id });
      },
      resetDemo: () => {
        set({ ...demoState(), sessionUserId: 'usr-admin', typing: {} });
      },

      createContact: (p) => {
        const c: Contact = { ...p, id: uid('ctt-'), createdAt: nowIso(), color: pickColor(p.name) };
        get().add('contacts', c);
        return c;
      },
      removeContact: (id) =>
        set((s) => {
          const convIds = new Set(s.conversations.filter((c) => c.contactId === id).map((c) => c.id));
          return {
            contacts: s.contacts.filter((c) => c.id !== id),
            conversations: s.conversations.filter((c) => !convIds.has(c.id)),
            messages: s.messages.filter((m) => !convIds.has(m.conversationId)),
            deals: s.deals.filter((d) => d.contactId !== id),
            tasks: s.tasks.map((t) => (t.contactId === id ? { ...t, contactId: undefined } : t)),
          };
        }),

      startConversation: (contactId, connectionId) => {
        const s = get();
        const existing = s.conversations.find((c) => c.contactId === contactId && c.status !== 'finalizado');
        if (existing) return existing.id;
        const conn = s.connections.find((c) => c.id === connectionId) ?? s.connections.find((c) => c.status === 'conectado') ?? s.connections[0];
        const conv: Conversation = {
          id: uid('cnv-'),
          contactId,
          connectionId: conn?.id ?? '',
          status: 'em_atendimento',
          assigneeId: s.sessionUserId ?? undefined,
          departmentId: conn?.departmentId,
          aiEnabled: false,
          unread: 0,
          pinned: false,
          lastMessageAt: nowIso(),
          aiReplies: 0,
        };
        s.add('conversations', conv);
        return conv.id;
      },

      sendMessage: (conversationId, body, opts = {}) => {
        const s = get();
        const conv = s.conversations.find((c) => c.id === conversationId);
        if (!conv) return;
        const contact = s.contacts.find((c) => c.id === conv.contactId);
        const author = opts.author ?? s.sessionUserId ?? 'system';
        const isHuman = !(AUTOMATED_AUTHORS as readonly string[]).includes(author);
        const text = fillTemplate(body, {
          nome: contact ? firstName(contact.name) : '',
          empresa: s.settings.companyName,
        });
        const msg: Message = {
          id: uid('msg-'),
          conversationId,
          direction: 'out',
          kind: opts.kind ?? 'text',
          body: text,
          author,
          createdAt: nowIso(),
          status: 'sent',
          fileName: opts.fileName,
        };
        const isNote = msg.kind === 'note';
        set((st) => ({
          messages: [...st.messages, msg],
          conversations: st.conversations.map((c) =>
            c.id !== conversationId
              ? c
              : {
                  ...c,
                  lastMessageAt: isNote ? c.lastMessageAt : msg.createdAt,
                  // humano assume: IA pausa e conversa vira "em atendimento" com ele
                  ...(isHuman && !isNote
                    ? {
                        status: 'em_atendimento' as const,
                        assigneeId: c.assigneeId ?? author,
                        aiEnabled: false,
                        aiReplies: 0,
                      }
                    : {}),
                  ...(author === 'ai' ? { aiReplies: c.aiReplies + 1 } : {}),
                },
          ),
        }));
        if (!isNote) {
          // simula o ciclo de entrega do WhatsApp (✓ → ✓✓ → ✓✓ azul)
          setTimeout(() => get().update('messages', msg.id, { status: 'delivered' }), 900);
        }
      },

      receiveMessage: (conversationId, body, kind = 'text') => {
        const s = get();
        const conv = s.conversations.find((c) => c.id === conversationId);
        if (!conv) return;
        const msg: Message = {
          id: uid('msg-'),
          conversationId,
          direction: 'in',
          kind,
          body,
          author: 'contact',
          createdAt: nowIso(),
          status: 'read',
          fileName: kind === 'document' ? body : undefined,
        };
        set((st) => ({
          messages: [
            ...st.messages.map((m) =>
              m.conversationId === conversationId && m.direction === 'out' && m.status !== 'read' ? { ...m, status: 'read' as const } : m,
            ),
            msg,
          ],
          conversations: st.conversations.map((c) =>
            c.id !== conversationId
              ? c
              : {
                  ...c,
                  unread: c.unread + 1,
                  lastMessageAt: msg.createdAt,
                  status: c.status === 'finalizado' ? 'aguardando' : c.status,
                  // lead respondeu: follow-up com "parar ao responder" é interrompido
                  followUp: undefined,
                },
          ),
          followUps: conv.followUp
            ? st.followUps.map((f) => (f.id === conv.followUp!.followUpId ? { ...f, replied: f.replied + 1 } : f))
            : st.followUps,
          broadcasts: conv.broadcastId
            ? st.broadcasts.map((b) => (b.id === conv.broadcastId ? { ...b, replied: b.replied + 1 } : b))
            : st.broadcasts,
        }));
        if (conv.broadcastId) get().update('conversations', conversationId, { broadcastId: undefined });
      },

      markRead: (conversationId) => {
        const conv = get().conversations.find((c) => c.id === conversationId);
        if (conv && conv.unread > 0) get().update('conversations', conversationId, { unread: 0 });
      },

      assign: (conversationId, userId) => {
        const s = get();
        const u = s.users.find((x) => x.id === userId);
        s.update('conversations', conversationId, {
          assigneeId: userId,
          status: userId ? 'em_atendimento' : 'aguardando',
        });
        s.add('messages', sysMsg(conversationId, u ? `Atendimento atribuído a ${u.name}` : 'Atendimento devolvido para a fila'));
      },

      setConversationStatus: (conversationId, status) => {
        const s = get();
        s.update('conversations', conversationId, {
          status,
          ...(status === 'finalizado' ? { aiEnabled: false, unread: 0, followUp: undefined } : {}),
        });
        const label = status === 'finalizado' ? 'Atendimento finalizado' : status === 'aguardando' ? 'Conversa reaberta' : 'Atendimento iniciado';
        const who = s.users.find((u) => u.id === s.sessionUserId)?.name;
        s.add('messages', sysMsg(conversationId, who ? `${label} por ${who}` : label));
      },

      transfer: (conversationId, departmentId, userId) => {
        const s = get();
        const dep = s.departments.find((d) => d.id === departmentId);
        const u = s.users.find((x) => x.id === userId);
        s.update('conversations', conversationId, {
          departmentId,
          assigneeId: userId,
          status: userId ? 'em_atendimento' : 'aguardando',
          aiEnabled: false,
        });
        s.add('messages', sysMsg(conversationId, `Transferido para ${dep?.name ?? 'departamento'}${u ? ` · ${u.name}` : ''}`));
      },

      setAI: (conversationId, enabled, agentId) => {
        const s = get();
        const agent = s.agents.find((a) => a.id === (agentId ?? s.agents.find((x) => x.active)?.id));
        s.update('conversations', conversationId, { aiEnabled: enabled, agentId: agent?.id, aiReplies: 0 });
        s.add('messages', sysMsg(conversationId, enabled ? `Agente de IA "${agent?.name ?? 'IA'}" ativado` : 'Agente de IA pausado'));
      },

      setTyping: (conversationId, typing) => set((s) => ({ typing: { ...s.typing, [conversationId]: typing } })),

      moveDeal: (dealId, stageId) => get().update('deals', dealId, { stageId, status: 'aberto', updatedAt: nowIso() }),
      setDealStatus: (dealId, status, lostReason) =>
        get().update('deals', dealId, { status, lostReason: status === 'perdido' ? lostReason : undefined, updatedAt: nowIso() }),
    }),
    {
      name: 'leadflow-crm-v1',
      storage: createJSONStorage(() => localStorage),
      // No modo Supabase só a sessão fica local; os dados vêm do banco.
      partialize: (s) => {
        if (isSupabaseMode) return { sessionUserId: s.sessionUserId } as Partial<Store>;
        const { typing: _t, toasts: _to, hydrated: _h, ...rest } = s;
        return Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function')) as Partial<Store>;
      },
    },
  ),
);

/** Usuário logado */
export const useMe = () => useStore((s) => s.users.find((u) => u.id === s.sessionUserId));

