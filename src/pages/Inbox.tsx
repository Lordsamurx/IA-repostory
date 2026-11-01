import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bot, FileText, Star, Image as ImageIcon, Mic, MessageSquarePlus, MessagesSquare, Pin, StickyNote, Zap } from 'lucide-react';
import { useMe, useStore } from '../store/useStore';
import { Avatar, Button, EmptyState, Menu, MenuItem, SearchInput, TagChip } from '../components/ui';
import { chatTime, cn, normalize, onlyDigits } from '../lib/utils';
import { simulateIncomingLead } from '../lib/automation';
import ChatPanel from '../components/inbox/ChatPanel';
import ContactPanel from '../components/inbox/ContactPanel';
import NewConversationModal from '../components/inbox/NewConversationModal';
import InboxFilters, { EMPTY_FILTERS, type ChatFilters } from '../components/inbox/InboxFilters';
import type { Conversation, LeadSource } from '../types';

type Filter = 'meus' | 'fila' | 'todos' | 'finalizados';

export default function Inbox() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const me = useMe();
  const conversations = useStore((s) => s.conversations);
  const contacts = useStore((s) => s.contacts);
  const messages = useStore((s) => s.messages);
  const connections = useStore((s) => s.connections);
  const tags = useStore((s) => s.tags);
  const users = useStore((s) => s.users);
  const typing = useStore((s) => s.typing);
  const markRead = useStore((s) => s.markRead);

  const [filter, setFilter] = useState<Filter>('todos');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ChatFilters>(EMPTY_FILTERS);
  const deals = useStore((s) => s.deals);
  const scheduled = useStore((s) => s.scheduled);
  const [showContact, setShowContact] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const lastMsg = useMemo(() => {
    const map = new Map<string, (typeof messages)[number]>();
    for (const m of messages) if (m.kind !== 'system') map.set(m.conversationId, m);
    return map;
  }, [messages]);

  const counts = {
    meus: conversations.filter((c) => c.status === 'em_atendimento' && c.assigneeId === me?.id).length,
    fila: conversations.filter((c) => c.status === 'aguardando').length,
    todos: conversations.filter((c) => c.status !== 'finalizado').length,
    finalizados: conversations.filter((c) => c.status === 'finalizado').length,
  };

  const list = useMemo(() => {
    const q = normalize(query);
    const match = (c: Conversation) => {
      if (filter === 'meus' && !(c.status === 'em_atendimento' && c.assigneeId === me?.id)) return false;
      if (filter === 'fila' && c.status !== 'aguardando') return false;
      if (filter === 'todos' && c.status === 'finalizado') return false;
      if (filter === 'finalizados' && c.status !== 'finalizado') return false;
      const f = filters;
      if (f.connectionId && c.connectionId !== f.connectionId) return false;
      const ct = contactById.get(c.contactId);
      if (f.tagIds.length) {
        const has = (id: string) => Boolean(ct?.tagIds.includes(id));
        if (f.tagMode === 'qualquer' && !f.tagIds.some(has)) return false;
        if (f.tagMode === 'todas' && !f.tagIds.every(has)) return false;
        if (f.tagMode === 'nao_tem' && f.tagIds.some(has)) return false;
      }
      if (f.responsible === 'none' && c.assigneeId) return false;
      if (f.responsible.startsWith('u:') && c.assigneeId !== f.responsible.slice(2)) return false;
      if (f.responsible.startsWith('d:') && c.departmentId !== f.responsible.slice(2)) return false;
      if (f.stageId && !deals.some((d) => d.contactId === c.contactId && d.stageId === f.stageId && d.status === 'aberto')) return false;
      if (f.unread && c.unread === 0) return false;
      if (f.favorites && !(me && c.favoriteBy?.includes(me.id))) return false;
      if (f.scheduled && !scheduled.some((m) => m.conversationId === c.id && m.status === 'pendente')) return false;
      if (q) {
        const hay = normalize(`${ct?.name} ${ct?.phone} ${lastMsg.get(c.id)?.body ?? ''}`);
        if (!hay.includes(q) && !(onlyDigits(q) && ct?.phone.includes(onlyDigits(q)))) return false;
      }
      return true;
    };
    const byDate = (a: Conversation, b: Conversation) =>
      filters.sort === 'antigas' ? a.lastMessageAt.localeCompare(b.lastMessageAt) : b.lastMessageAt.localeCompare(a.lastMessageAt);
    return conversations
      .filter(match)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (filters.sort === 'nao_lidas' ? Number(b.unread > 0) - Number(a.unread > 0) : 0) || byDate(a, b));
  }, [conversations, filter, query, filters, deals, scheduled, me, contactById, lastMsg]);

  const active = conversations.find((c) => c.id === conversationId);

  useEffect(() => {
    if (active && active.unread > 0) markRead(active.id);
  }, [active, markRead]);

  const open = (id: string) => navigate(`/inbox/${id}`);

  const simulate = (source: LeadSource, connectionId?: string) => {
    const id = simulateIncomingLead(source, connectionId);
    setFilter('todos');
    open(id);
  };

  const preview = (c: Conversation) => {
    if (typing[c.id]) return <span className="text-brand-600 italic">digitando…</span>;
    const m = lastMsg.get(c.id);
    if (!m) return <span className="italic">Sem mensagens</span>;
    const prefix =
      m.kind === 'note' ? (
        <StickyNote className="h-3.5 w-3.5 shrink-0 text-[#b88a00]" />
      ) : m.direction === 'out' ? (
        m.author === 'ai' || m.author === 'bot' ? (
          <Bot className="h-3.5 w-3.5 shrink-0 text-brand-600" />
        ) : m.author === 'broadcast' ? (
          <span className="shrink-0 text-ink-3">📣</span>
        ) : (
          <span className="shrink-0 text-ink-3">Você:</span>
        )
      ) : null;
    const icon =
      m.kind === 'audio' ? <Mic className="h-3.5 w-3.5 shrink-0" /> : m.kind === 'image' ? <ImageIcon className="h-3.5 w-3.5 shrink-0" /> : m.kind === 'document' ? <FileText className="h-3.5 w-3.5 shrink-0" /> : null;
    const text = m.kind === 'audio' ? 'Mensagem de voz' : m.kind === 'image' ? 'Imagem' : m.body;
    return (
      <span className="flex min-w-0 items-center gap-1">
        {prefix}
        {icon}
        <span className="truncate">{text}</span>
      </span>
    );
  };

  const TABS: { v: Filter; label: string }[] = [
    { v: 'meus', label: 'Meus' },
    { v: 'fila', label: 'Fila' },
    { v: 'todos', label: 'Todos' },
    { v: 'finalizados', label: 'Finalizados' },
  ];

  return (
    <div className="flex h-full min-h-0">
      {/* Lista de conversas */}
      <section className={cn('flex w-full flex-col border-r border-line bg-surface md:w-[340px] md:shrink-0', active && 'hidden md:flex')}>
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h1 className="text-base font-semibold">Atendimentos</h1>
          <div className="flex items-center gap-1">
            <Menu
              width={250}
              trigger={(t) => (
                <Button variant="ghost" size="sm" onClick={t} icon={<Zap className="h-4 w-4" />} title="Gerar mensagens de teste">
                  Simular
                </Button>
              )}
            >
              {(close) => (
                <>
                  <div className="px-2.5 py-1.5 text-[11px] text-ink-3">Gera um lead de teste — útil antes de conectar o WhatsApp.</div>
                  {(['Meta Ads', 'Instagram', 'Site', 'Google'] as LeadSource[]).map((s) => (
                    <MenuItem key={s} onClick={() => (simulate(s), close())}>
                      Novo lead via {s}
                    </MenuItem>
                  ))}
                  {connections.length > 1 && (
                    <>
                      <div className="my-1 h-px bg-line" />
                      <div className="px-2.5 py-1 text-[11px] text-ink-3">Mensagem nova na conexão:</div>
                      {connections.filter((c) => !c.instance).map((c) => (
                        <MenuItem key={c.id} onClick={() => (simulate('WhatsApp', c.id), close())}>
                          <span className="h-2 w-2 rounded-full" style={{ background: c.color }} /> {c.name}
                        </MenuItem>
                      ))}
                    </>
                  )}
                </>
              )}
            </Menu>
            <Button size="sm" onClick={() => setNewOpen(true)} icon={<MessageSquarePlus className="h-4 w-4" />}>
              Nova
            </Button>
          </div>
        </div>

        <div className="space-y-2 px-4 pb-3">
          <SearchInput placeholder="Buscar nome, telefone ou mensagem" value={query} onChange={(e) => setQuery(e.target.value)} />
          <InboxFilters value={filters} onChange={setFilters} />
        </div>

        <div className="flex border-b border-line px-2" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.v}
              role="tab"
              aria-selected={filter === t.v}
              onClick={() => setFilter(t.v)}
              className={cn(
                'relative flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[13px] font-medium',
                filter === t.v ? 'text-brand-700' : 'text-ink-3 hover:text-ink',
              )}
            >
              {t.label}
              <span className={cn('rounded-full px-1.5 text-[10.5px]', filter === t.v ? 'bg-brand-500 text-white' : 'bg-canvas')}>{counts[t.v]}</span>
              {filter === t.v && <span className="absolute right-2 bottom-0 left-2 h-0.5 rounded-full bg-brand-500" />}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {list.length === 0 && (
            <EmptyState icon={<MessagesSquare className="h-5 w-5" />} title="Nenhuma conversa aqui" text="Quando um lead mandar mensagem no WhatsApp, ela aparece nesta lista." />
          )}
          {list.map((c) => {
            const ct = contactById.get(c.contactId);
            const conn = connections.find((x) => x.id === c.connectionId);
            const assignee = users.find((u) => u.id === c.assigneeId);
            const cTags = tags.filter((t) => ct?.tagIds.includes(t.id)).slice(0, 2);
            return (
              <button
                key={c.id}
                onClick={() => open(c.id)}
                className={cn(
                  'flex w-full gap-3 border-b border-line/70 px-4 py-3 text-left transition-colors',
                  c.id === conversationId ? 'bg-brand-50' : 'hover:bg-canvas',
                )}
              >
                <div className="relative flex shrink-0 self-start">
                  <Avatar name={ct?.name ?? '?'} color={ct?.color} size={44} />
                  {conn && <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-white" style={{ background: conn.color }} title={conn.name} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('truncate text-[14px]', c.unread ? 'font-semibold' : 'font-medium')}>{ct?.name ?? 'Contato removido'}</span>
                    {c.pinned && <Pin className="h-3 w-3 shrink-0 text-ink-3" />}
                    {me && c.favoriteBy?.includes(me.id) && <Star className="h-3 w-3 shrink-0 fill-[#eda100] text-[#eda100]" />}
                    <span className={cn('ml-auto shrink-0 text-[11px]', c.unread ? 'font-semibold text-brand-600' : 'text-ink-3')}>{chatTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-2">
                    <span className="min-w-0 flex-1">{preview(c)}</span>
                    {c.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">{c.unread}</span>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {c.status === 'aguardando' && <span className="rounded bg-[#fff6e0] px-1.5 py-px text-[10.5px] font-medium text-[#8a5a00]">Na fila</span>}
                    {c.aiEnabled && (
                      <span className="inline-flex items-center gap-1 rounded bg-brand-50 px-1.5 py-px text-[10.5px] font-medium text-brand-700">
                        <Bot className="h-3 w-3" /> IA
                      </span>
                    )}
                    {cTags.map((t) => (
                      <TagChip key={t.id} name={t.name} color={t.color} />
                    ))}
                    {assignee && (
                      <span className="ml-auto" title={`Responsável: ${assignee.name}`}>
                        <Avatar name={assignee.name} color={assignee.color} size={18} />
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Conversa */}
      {active ? (
        <>
          <ChatPanel key={active.id} conversation={active} onBack={() => navigate('/inbox')} onToggleContact={() => setShowContact((v) => !v)} contactOpen={showContact} />
          {showContact && <ContactPanel conversation={active} onClose={() => setShowContact(false)} />}
        </>
      ) : (
        <div className="chat-wallpaper hidden flex-1 items-center justify-center md:flex">
          <div className="max-w-sm rounded-2xl bg-white/85 p-8 text-center shadow-card backdrop-blur">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <MessagesSquare className="h-6 w-6" />
            </div>
            <p className="font-semibold">Selecione uma conversa</p>
            <p className="mt-1 text-[13px] text-ink-3">Escolha um atendimento na lista ao lado ou inicie uma nova conversa.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => simulate('Meta Ads')} icon={<Zap className="h-4 w-4" />}>
                Simular lead
              </Button>
              <Button size="sm" onClick={() => setNewOpen(true)}>
                Nova conversa
              </Button>
            </div>
          </div>
        </div>
      )}

      <NewConversationModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => open(id)} />
    </div>
  );
}
