import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  Bot,
  AlertCircle,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  CornerUpLeft,
  Eraser,
  FileText,
  Forward,
  FolderOpen,
  Laptop,
  MailWarning,
  PencilLine,
  Star,
  ThumbsUp,
  Workflow,
  X,
  MoreVertical,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  Play,
  RotateCcw,
  Send,
  Smile,
  StickyNote,
  UserPlus,
  Zap,
} from 'lucide-react';
import { useMe, useStore } from '../../store/useStore';
import { Avatar, Button, Confirm, Field, IconButton, Input, Menu, MenuItem, Modal, Select, Switch, Textarea } from '../ui';
import { FileLibraryModal, ForwardModal, isImageMime } from './ChatModals';
import { startFlow } from '../../lib/chatbot';
import { cn, dateTimeBR, dayLabel, formatPhone, normalize, nowIso, timeHM, uid } from '../../lib/utils';
import type { Conversation, Message } from '../../types';

const EMOJIS = ['😊', '😉', '😍', '🙏', '👍', '👏', '🎉', '💚', '💙', '✅', '📅', '📍', '💰', '🚗', '⏰', '🤝', '😅', '🙂', '🔥', '⭐'];

/** Anexos: só estes tipos viram foto no chat (a imagem é guardada no próprio registro). */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_FILE_BYTES = 16 * 1024 * 1024;

export default function ChatPanel({
  conversation: conv,
  onBack,
  onToggleContact,
  contactOpen,
}: {
  conversation: Conversation;
  onBack: () => void;
  onToggleContact: () => void;
  contactOpen: boolean;
}) {
  const me = useMe();
  const contact = useStore((s) => s.contacts.find((c) => c.id === conv.contactId));
  const allMessages = useStore((s) => s.messages);
  const users = useStore((s) => s.users);
  const agents = useStore((s) => s.agents);
  const departments = useStore((s) => s.departments);
  const connection = useStore((s) => s.connections.find((c) => c.id === conv.connectionId));
  const quickReplies = useStore((s) => s.quickReplies);
  const isTyping = useStore((s) => s.typing[conv.id]);
  const settings = useStore((s) => s.settings);
  const allScheduled = useStore((s) => s.scheduled);
  const chatbots = useStore((s) => s.chatbots);
  const { sendMessage, receiveMessage, assign, setConversationStatus, transfer, setAI, update, toast } = useStore.getState();

  const messages = useMemo(() => allMessages.filter((m) => m.conversationId === conv.id), [allMessages, conv.id]);
  const [mode, setMode] = useState<'text' | 'note'>('text');
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [simText, setSimText] = useState('');
  const [qrIndex, setQrIndex] = useState(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const isFavorite = Boolean(me && conv.favoriteBy?.includes(me.id));
  const byId = useMemo(() => new Map(allMessages.map((m) => [m.id, m])), [allMessages]);
  const scheduled = useMemo(() => allScheduled.filter((m) => m.conversationId === conv.id && m.status === 'pendente'), [allScheduled, conv.id]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isTyping]);

  // Respostas rápidas: digite "/" + atalho
  const qrQuery = text.startsWith('/') ? text.slice(1).toLowerCase() : null;
  const qrMatches = qrQuery !== null ? quickReplies.filter((q) => q.shortcut.toLowerCase().includes(qrQuery)).slice(0, 6) : [];

  const agent = agents.find((a) => a.id === conv.agentId);
  const isFinished = conv.status === 'finalizado';

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    // @menções em notas internas: avisa o colega mencionado
    const mentions =
      mode === 'note'
        ? users.filter((u) => u.id !== me?.id && new RegExp(`@${normalize(u.name.split(' ')[0]!)}\\b`).test(normalize(body))).map((u) => u.id)
        : [];
    sendMessage(conv.id, body, { kind: mode, replyTo: replyTo?.id, mentions });
    for (const uid_ of mentions)
      useStore.getState().add('notifications', {
        id: uid('ntf-'),
        title: `${me?.name ?? 'Alguém'} mencionou você`,
        body: `${contact?.name ?? 'Conversa'}: ${body.slice(0, 80)}`,
        createdAt: nowIso(),
        read: false,
        link: `/inbox/${conv.id}`,
        userId: uid_,
      });
    setReplyTo(null);
    setText('');
    setMode('text');
    inputRef.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (qrMatches.length) {
      if (e.key === 'ArrowDown') return e.preventDefault(), setQrIndex((i) => (i + 1) % qrMatches.length);
      if (e.key === 'ArrowUp') return e.preventDefault(), setQrIndex((i) => (i - 1 + qrMatches.length) % qrMatches.length);
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        setText(qrMatches[qrIndex]!.content);
        setQrIndex(0);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) return toast(`Arquivo muito grande (máximo de ${MAX_FILE_BYTES / 1_000_000} MB)`, 'error');
    // só PNG, JPEG, GIF e WebP viram foto; qualquer outra coisa entra como documento
    const isPhoto = IMAGE_TYPES.includes(f.type) && f.size <= MAX_IMAGE_BYTES;
    if (isPhoto) {
      const reader = new FileReader();
      reader.onload = () => sendMessage(conv.id, String(reader.result), { kind: 'image', fileName: f.name });
      reader.readAsDataURL(f);
    } else {
      const kind = f.type.startsWith('audio/') ? 'audio' : 'document';
      sendMessage(conv.id, f.name, { kind, fileName: f.name });
    }
  };

  const grouped = useMemo(() => {
    const out: { day: string; items: Message[] }[] = [];
    for (const m of messages) {
      const day = dayLabel(m.createdAt);
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages]);

  return (
    <section className={cn('flex min-w-0 flex-1 flex-col', 'bg-chat')}>
      {/* Cabeçalho */}
      <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-line bg-surface px-3 md:px-4">
        <IconButton label="Voltar" className="md:hidden" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <Avatar name={contact?.name ?? '?'} color={contact?.color} size={38} />
        <div className="min-w-[120px] flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14.5px] font-semibold">{contact?.name}</span>
            <button
              aria-label={isFavorite ? 'Remover dos favoritos' : 'Marcar como favorito'}
              title={isFavorite ? 'Remover dos favoritos' : 'Marcar como favorito'}
              onClick={() =>
                me &&
                update('conversations', conv.id, {
                  favoriteBy: isFavorite ? (conv.favoriteBy ?? []).filter((x) => x !== me.id) : [...(conv.favoriteBy ?? []), me.id],
                })
              }
            >
              <Star className={cn('h-4 w-4', isFavorite ? 'fill-[#eda100] text-[#eda100]' : 'text-ink-3 hover:text-ink-2')} />
            </button>
          </div>
          <div className="flex items-center gap-1.5 truncate text-[12px] text-ink-3">
            {contact && formatPhone(contact.phone)}
            {connection && (
              <>
                <span>·</span>
                <span className="h-2 w-2 rounded-full" style={{ background: connection.color }} />
                {connection.name}
              </>
            )}
          </div>
        </div>

        {/* IA */}
        <Menu
          width={260}
          trigger={(t) => (
            <button
              onClick={t}
              className={cn(
                'hidden h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium sm:flex',
                conv.aiEnabled ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-line text-ink-2 hover:bg-canvas',
              )}
            >
              <Bot className="h-4 w-4" />
              <span className="hidden 2xl:inline">{conv.aiEnabled ? (agent?.name.split('—')[0]?.trim() ?? 'IA ativa') : 'IA pausada'}</span>
              <span className={cn('h-2 w-2 rounded-full 2xl:hidden', conv.aiEnabled ? 'bg-good' : 'bg-ink-3')} title={conv.aiEnabled ? 'IA ativa' : 'IA pausada'} />
            </button>
          )}
        >
          {(close) => (
            <div className="p-1.5">
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-[13px] font-semibold">Agente de IA nesta conversa</span>
                <Switch checked={conv.aiEnabled} label="Ativar IA" onChange={(v) => setAI(conv.id, v, conv.agentId)} />
              </div>
              <p className="px-1 pb-2 text-[12px] text-ink-3">Quando você responde manualmente, a IA pausa sozinha.</p>
              {agents.filter((a) => a.active).length === 0 && <p className="px-1 py-2 text-[12px] text-critical">Nenhum agente ativo. Crie um em Agentes de IA.</p>}
              {agents
                .filter((a) => a.active)
                .map((a) => (
                  <MenuItem key={a.id} icon={<Bot />} onClick={() => (setAI(conv.id, true, a.id), close())}>
                    <span className="flex-1">{a.name}</span>
                    {conv.aiEnabled && conv.agentId === a.id && <Check className="h-4 w-4 text-brand-600" />}
                  </MenuItem>
                ))}
            </div>
          )}
        </Menu>

        {!isFinished && conv.assigneeId !== me?.id && (
          <Button size="sm" title="Assumir atendimento" aria-label="Assumir atendimento" onClick={() => me && assign(conv.id, me.id)} icon={<UserPlus className="h-4 w-4" />}>
            <span className="hidden 2xl:inline">Assumir</span>
          </Button>
        )}
        {isFinished ? (
          <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConversationStatus(conv.id, 'em_atendimento')}>
            Reabrir
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            icon={<CheckCircle2 className="h-4 w-4 text-good" />}
            onClick={() => {
              setConversationStatus(conv.id, 'finalizado');
              toast('Atendimento finalizado');
            }}
          >
            <span className="hidden lg:inline">Finalizar</span>
          </Button>
        )}

        <Menu
          trigger={(t) => (
            <IconButton label="Mais ações" onClick={t}>
              <MoreVertical className="h-4 w-4" />
            </IconButton>
          )}
        >
          {(close) => (
            <>
              <MenuItem icon={<ArrowRightLeft />} onClick={() => (setTransferOpen(true), close())}>
                Transferir
              </MenuItem>
              <div className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Atribuir a</div>
              {users.map((u) => (
                <MenuItem key={u.id} onClick={() => (assign(conv.id, u.id), close())}>
                  <Avatar name={u.name} color={u.color} size={20} presence={u.presence} />
                  <span className="flex-1">{u.name}</span>
                  {conv.assigneeId === u.id && <Check className="h-4 w-4 text-brand-600" />}
                </MenuItem>
              ))}
              <MenuItem onClick={() => (assign(conv.id, undefined), close())}>Devolver para a fila</MenuItem>
              <div className="my-1 h-px bg-line" />
              <MenuItem icon={<Pin />} onClick={() => (update('conversations', conv.id, { pinned: !conv.pinned }), close())}>
                {conv.pinned ? 'Desafixar' : 'Fixar no topo'}
              </MenuItem>
              <MenuItem icon={<PencilLine />} onClick={() => (setNewName(contact?.name ?? ''), setRenameOpen(true), close())}>
                Alterar nome do chat
              </MenuItem>
              <MenuItem
                icon={<MailWarning />}
                onClick={() => {
                  update('conversations', conv.id, { unread: Math.max(1, conv.unread), lastMessageAt: nowIso() });
                  close();
                  onBack();
                }}
              >
                Marcar como não lida
              </MenuItem>
              <MenuItem
                icon={<ThumbsUp />}
                onClick={() => {
                  if (!settings.nps?.enabled) toast('Ative o NPS em Configurações → NPS', 'info');
                  else {
                    useStore.getState().requestNps(conv.id);
                    toast('Pesquisa NPS enviada');
                  }
                  close();
                }}
              >
                Solicitar NPS
              </MenuItem>
              <div className="flex items-center justify-between px-2.5 py-2 text-[13px]">
                <span className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-ink-3" /> Chatbot nesta conversa
                </span>
                <Switch checked={!conv.botDisabled} label="Chatbot nesta conversa" onChange={(v) => update('conversations', conv.id, { botDisabled: !v, ...(v ? {} : { bot: undefined }) })} />
              </div>
              <MenuItem icon={<Zap />} onClick={() => (setSimOpen(true), close())}>
                Simular mensagem do cliente
              </MenuItem>
              <MenuItem icon={<Eraser />} danger onClick={() => (setClearOpen(true), close())}>
                Apagar todas as mensagens
              </MenuItem>
            </>
          )}
        </Menu>
        <IconButton label={contactOpen ? 'Ocultar dados do contato' : 'Mostrar dados do contato'} onClick={onToggleContact} className="hidden xl:inline-flex">
          {contactOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </IconButton>
      </header>

      {/* Mensagens */}
      <div ref={scrollRef} className="chat-wallpaper flex-1 overflow-y-auto px-3 py-4 md:px-[6%]">
        {grouped.map((g) => (
          <Fragment key={g.day}>
            <div className="sticky top-0 z-10 my-3 flex justify-center">
              <span className="rounded-lg bg-white/95 px-3 py-1 text-[11.5px] font-medium text-ink-2 capitalize shadow-sm">{g.day}</span>
            </div>
            {g.items.map((m, i) => (
              <Bubble
                key={m.id}
                m={m}
                prev={g.items[i - 1]}
                users={users}
                agentName={agent?.name}
                quoted={m.replyTo ? byId.get(m.replyTo) : undefined}
                onReply={isFinished ? undefined : () => (setReplyTo(m), inputRef.current?.focus())}
                onForward={() => setForwarding(m)}
              />
            ))}
          </Fragment>
        ))}
        {isTyping && (
          <div className="mt-2 flex justify-end">
            <div className="flex items-center gap-2 rounded-xl rounded-tr-sm bg-bubble-out px-3 py-2 text-[12px] text-ink-3 shadow-sm">
              <Bot className="h-3.5 w-3.5 text-brand-600" />
              <span className="flex gap-0.5">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-3" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-3" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-3" />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Compositor */}
      {isFinished ? (
        <div className="flex items-center justify-center gap-3 border-t border-line bg-surface px-4 py-3 text-[13px] text-ink-3">
          Atendimento finalizado.
          <Button size="sm" variant="soft" onClick={() => setConversationStatus(conv.id, 'em_atendimento')}>
            Reabrir conversa
          </Button>
        </div>
      ) : (
        <div className={cn('relative border-t px-3 pt-2 pb-3 md:px-4', mode === 'note' ? 'border-[#f0d77a] bg-[#fffbea]' : 'border-line bg-surface')}>
          {conv.status === 'aguardando' && !conv.aiEnabled && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-[#fff6e0] px-3 py-1.5 text-[12.5px] text-[#8a5a00]">
              Este lead está na fila aguardando atendimento.
              <button className="font-semibold hover:underline" onClick={() => me && assign(conv.id, me.id)}>
                Assumir agora
              </button>
            </div>
          )}
          {conv.aiEnabled && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-1.5 text-[12.5px] text-brand-700">
              <span className="flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5" /> {agent?.name ?? 'A IA'} está respondendo esta conversa.
              </span>
              <button className="font-semibold hover:underline" onClick={() => setAI(conv.id, false)}>
                Pausar IA
              </button>
            </div>
          )}

          {scheduled.map((m) => (
            <div key={m.id} className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-1.5 text-[12.5px]">
              <Clock className="h-3.5 w-3.5 shrink-0 text-brand-600" />
              <span className="shrink-0 font-medium">Agendada para {dateTimeBR(m.sendAt)}:</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{m.body}</span>
              <button
                className="shrink-0 font-medium text-brand-700 hover:underline"
                onClick={() => {
                  update('scheduled', m.id, { status: 'enviada' });
                  sendMessage(conv.id, m.body);
                }}
              >
                Enviar agora
              </button>
              <button className="shrink-0 font-medium text-critical hover:underline" onClick={() => update('scheduled', m.id, { status: 'cancelada' })}>
                Cancelar
              </button>
            </div>
          ))}
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border-l-4 border-brand-500 bg-canvas px-3 py-1.5 text-[12.5px]">
              <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1 truncate text-ink-2">
                <b className="text-ink">{replyTo.direction === 'in' ? contact?.name : 'Você'}:</b> {replyTo.kind === 'image' ? '🖼️ Imagem' : replyTo.fileName ?? replyTo.body}
              </span>
              <button aria-label="Cancelar resposta" onClick={() => setReplyTo(null)} className="text-ink-3 hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="mb-1.5 flex gap-1">
            {(['text', 'note'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium',
                  mode === m ? (m === 'note' ? 'bg-[#fbe9a6] text-[#7a5600]' : 'bg-brand-50 text-brand-700') : 'text-ink-3 hover:bg-canvas',
                )}
              >
                {m === 'note' ? <StickyNote className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                {m === 'note' ? 'Nota interna' : 'Responder'}
              </button>
            ))}
            <span className="ml-auto hidden self-center text-[11px] text-ink-3 sm:block">
              Digite <kbd className="rounded border border-line bg-canvas px-1">/</kbd> para respostas rápidas
            </span>
          </div>

          {qrMatches.length > 0 && (
            <div className="absolute right-4 bottom-full left-4 mb-1 overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
              {qrMatches.map((q, i) => (
                <button
                  key={q.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setText(q.content);
                  }}
                  className={cn('flex w-full gap-3 px-3 py-2 text-left text-[13px]', i === qrIndex ? 'bg-brand-50' : 'hover:bg-canvas')}
                >
                  <span className="font-mono font-semibold text-brand-700">/{q.shortcut}</span>
                  <span className="truncate text-ink-2">{q.content.replace('{{empresa}}', settings.companyName)}</span>
                </button>
              ))}
            </div>
          )}

          {emojiOpen && (
            <div className="absolute bottom-full left-4 mb-1 grid grid-cols-10 gap-1 rounded-xl border border-line bg-surface p-2 shadow-pop">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  className="rounded p-1 text-lg hover:bg-canvas"
                  onClick={() => {
                    setText((t) => t + em);
                    setEmojiOpen(false);
                    inputRef.current?.focus();
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <IconButton label="Emojis" onClick={() => setEmojiOpen((v) => !v)}>
              <Smile className="h-5 w-5" />
            </IconButton>
            <Menu
              align="left"
              side="top"
              width={230}
              trigger={(t) => (
                <IconButton label="Anexar arquivo" onClick={t} disabled={mode === 'note'}>
                  <Paperclip className="h-5 w-5" />
                </IconButton>
              )}
            >
              {(close) => (
                <div>
                  <MenuItem icon={<FolderOpen />} onClick={() => (setLibraryOpen(true), close())}>
                    Da biblioteca de arquivos
                  </MenuItem>
                  <MenuItem icon={<Laptop />} onClick={() => (fileRef.current?.click(), close())}>
                    Do computador
                  </MenuItem>
                </div>
              )}
            </Menu>
            <Menu
              align="left"
              side="top"
              width={260}
              trigger={(t) => (
                <IconButton label="Acionar fluxo do chatbot" onClick={t} disabled={mode === 'note' || chatbots.length === 0}>
                  <Workflow className="h-5 w-5" />
                </IconButton>
              )}
            >
              {(close) => (
                <div>
                  <div className="px-2.5 py-1.5 text-[11px] text-ink-3">Envia o menu do fluxo para este cliente agora:</div>
                  {chatbots.map((f) => (
                    <MenuItem
                      key={f.id}
                      icon={<Workflow />}
                      onClick={() => {
                        startFlow(conv, f);
                        toast(`Fluxo "${f.name}" acionado`);
                        close();
                      }}
                    >
                      {f.name}
                    </MenuItem>
                  ))}
                </div>
              )}
            </Menu>
            <IconButton
              label="Agendar mensagem"
              disabled={mode === 'note' || !text.trim()}
              onClick={() => {
                const d = new Date(Date.now() + 3_600_000);
                setScheduleAt(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                setScheduleOpen(true);
              }}
            >
              <Clock className="h-5 w-5" />
            </IconButton>
            <input ref={fileRef} type="file" hidden onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ''))} />
            <Textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setQrIndex(0);
              }}
              onKeyDown={onKey}
              placeholder={mode === 'note' ? 'Escreva uma nota visível só para a equipe…' : 'Digite uma mensagem'}
              className={cn('max-h-36 min-h-10 resize-none', mode === 'note' && 'border-[#f0d77a] bg-white')}
              style={{ height: Math.min(144, 40 + Math.max(0, text.split('\n').length - 1) * 20) }}
            />
            <button
              onClick={submit}
              disabled={!text.trim()}
              aria-label="Enviar"
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-40',
                mode === 'note' ? 'bg-[#d6a300]' : 'bg-brand-500 hover:bg-brand-600',
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        departments={departments}
        users={users}
        defaultDep={conv.departmentId}
        onConfirm={(dep, user) => {
          transfer(conv.id, dep, user || undefined);
          toast('Conversa transferida');
        }}
      />

      <Modal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Agendar mensagem"
        size="sm"
        footer={
          <Button
            disabled={!scheduleAt || new Date(scheduleAt) <= new Date()}
            onClick={() => {
              useStore.getState().add('scheduled', {
                id: uid('sch-'),
                conversationId: conv.id,
                body: text.trim(),
                sendAt: new Date(scheduleAt).toISOString(),
                status: 'pendente',
                createdBy: me?.id,
                createdAt: nowIso(),
              });
              setText('');
              setScheduleOpen(false);
              toast(`Mensagem agendada para ${dateTimeBR(new Date(scheduleAt).toISOString())}`);
            }}
          >
            Agendar
          </Button>
        }
      >
        <p className="mb-3 rounded-lg bg-canvas p-3 text-[13px] whitespace-pre-wrap">{text}</p>
        <Field label="Enviar em">
          <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={simOpen}
        onClose={() => setSimOpen(false)}
        title="Simular mensagem do cliente"
        size="sm"
        footer={
          <Button
            disabled={!simText.trim()}
            onClick={() => {
              receiveMessage(conv.id, simText.trim());
              setSimText('');
              setSimOpen(false);
            }}
          >
            Receber mensagem
          </Button>
        }
      >
        <p className="mb-3 text-[13px] text-ink-3">
          Use para testar o fluxo (IA, follow-up, notificações) como se {contact?.name ?? 'o contato'} tivesse escrito pelo WhatsApp.
        </p>
        <Textarea rows={3} autoFocus value={simText} onChange={(e) => setSimText(e.target.value)} placeholder="Ex.: Qual o endereço de vocês?" />
      </Modal>

      <FileLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onPick={(f) =>
          sendMessage(conv.id, isImageMime(f.mime) ? f.data : f.name, { kind: isImageMime(f.mime) ? 'image' : 'document', fileName: f.name, fileData: f.data, raw: true })
        }
      />
      <ForwardModal message={forwarding} onClose={() => setForwarding(null)} />
      <Modal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Alterar nome do chat"
        size="sm"
        footer={
          <Button
            disabled={!newName.trim()}
            onClick={() => {
              if (contact) update('contacts', contact.id, { name: newName.trim() });
              setRenameOpen(false);
              toast('Nome atualizado para toda a equipe');
            }}
          >
            Salvar
          </Button>
        }
      >
        <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
        <p className="mt-2 text-[12px] text-ink-3">Muda o nome só no CRM, para todos os usuários. A agenda do celular não é alterada.</p>
      </Modal>
      <Confirm
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Apagar todas as mensagens?"
        text="Limpa o histórico desta conversa no CRM. O WhatsApp do celular não é afetado. Não dá para desfazer."
        confirmLabel="Apagar"
        onConfirm={() => {
          useStore.setState((st) => ({ messages: st.messages.filter((m) => m.conversationId !== conv.id) }));
          toast('Mensagens apagadas');
        }}
      />
    </section>
  );
}

/** Formatação do WhatsApp: *negrito* e _itálico_ */
function waFormat(text: string) {
  return text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, i) =>
    part.length > 2 && part.startsWith('*') && part.endsWith('*') ? (
      <b key={i}>{part.slice(1, -1)}</b>
    ) : part.length > 2 && part.startsWith('_') && part.endsWith('_') ? (
      <i key={i}>{part.slice(1, -1)}</i>
    ) : (
      part
    ),
  );
}

function Ticks({ status, failed }: { status: Message['status']; failed?: string }) {
  if (failed)
    return (
      <span title={failed} className="flex items-center gap-0.5 text-critical">
        <AlertCircle className="h-3.5 w-3.5" /> não enviada
      </span>
    );
  if (status === 'sent') return <Check className="h-3.5 w-3.5 text-ink-3" />;
  return <CheckCheck className={cn('h-3.5 w-3.5', status === 'read' ? 'text-[#34b7f1]' : 'text-ink-3')} />;
}

function Bubble({
  m,
  prev,
  users,
  agentName,
  quoted,
  onReply,
  onForward,
}: {
  m: Message;
  prev?: Message;
  users: { id: string; name: string }[];
  agentName?: string;
  quoted?: Message;
  onReply?: () => void;
  onForward: () => void;
}) {
  if (m.kind === 'system') {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-lg bg-[#e1f0f7] px-3 py-1 text-[11.5px] text-[#35586b]">
          {m.body} · {timeHM(m.createdAt)}
        </span>
      </div>
    );
  }
  const out = m.direction === 'out';
  const isNote = m.kind === 'note';
  const grouped = prev && prev.direction === m.direction && prev.kind !== 'system' && prev.author === m.author;
  const authorLabel =
    m.author === 'ai'
      ? `🤖 ${agentName ?? 'Agente de IA'}`
      : m.author === 'bot'
        ? '🤖 Chatbot'
        : m.author === 'broadcast'
          ? '📣 Disparo'
          : m.author === 'followup'
            ? '🔁 Follow-up automático'
            : m.author === 'nps'
              ? '⭐ Pesquisa NPS'
            : out
          ? users.find((u) => u.id === m.author)?.name
          : undefined;

  return (
    <div className={cn('group/msg flex items-center gap-1', out ? 'justify-end' : 'justify-start', grouped ? 'mt-0.5' : 'mt-2.5')}>
      {!isNote && (
        <div className={cn('flex gap-0.5 opacity-0 transition group-hover/msg:opacity-100', out ? 'order-first' : 'order-last')}>
          {onReply && (
            <button aria-label="Responder" title="Responder" onClick={onReply} className="rounded-full bg-white/90 p-1.5 text-ink-3 shadow-sm hover:text-ink">
              <CornerUpLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <button aria-label="Encaminhar" title="Encaminhar" onClick={onForward} className="rounded-full bg-white/90 p-1.5 text-ink-3 shadow-sm hover:text-ink">
            <Forward className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div
        className={cn(
          'relative max-w-[78%] rounded-xl px-2.5 pt-1.5 pb-1 text-[14px] leading-snug shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] md:max-w-[65%]',
          isNote ? 'border border-[#f0d77a] bg-bubble-note' : out ? 'bg-bubble-out' : 'bg-bubble-in',
          !grouped && (out ? 'rounded-tr-sm' : 'rounded-tl-sm'),
        )}
      >
        {isNote && (
          <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#8a6500]">
            <StickyNote className="h-3 w-3" /> Nota interna · {authorLabel}
          </div>
        )}
        {!isNote && out && !grouped && authorLabel && <div className="mb-0.5 text-[11.5px] font-semibold text-brand-700">{authorLabel}</div>}
        {m.forwarded && (
          <div className="mb-0.5 flex items-center gap-1 text-[11px] text-ink-3 italic">
            <Forward className="h-3 w-3" /> Encaminhada
          </div>
        )}
        {quoted && (
          <div className="mb-1 rounded-md border-l-4 border-brand-500 bg-black/5 px-2 py-1 text-[12.5px]">
            <div className="font-semibold text-brand-700">{quoted.direction === 'in' ? 'Cliente' : (users.find((u) => u.id === quoted.author)?.name ?? 'Você')}</div>
            <div className="line-clamp-2 text-ink-2">{quoted.kind === 'image' ? '🖼️ Imagem' : quoted.fileName ?? quoted.body}</div>
          </div>
        )}

        {m.kind === 'image' ? (
          m.body.startsWith('data:') ? (
            <img src={m.body} alt={m.fileName ?? 'imagem'} className="mb-1 max-h-72 rounded-lg" />
          ) : (
            <div className="mb-1 flex h-40 w-60 items-center justify-center rounded-lg bg-black/5 text-[12px] text-ink-3">{m.fileName ?? 'Imagem'}</div>
          )
        ) : m.kind === 'audio' ? (
          <div className="flex w-60 items-center gap-2 py-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white">
              <Play className="h-4 w-4" />
            </span>
            <span className="h-1 flex-1 rounded-full bg-black/15">
              <span className="block h-1 w-1/3 rounded-full bg-brand-500" />
            </span>
            <span className="text-[11px] text-ink-3">0:18</span>
          </div>
        ) : m.kind === 'document' ? (
          <div className="mb-1 flex items-center gap-2.5 rounded-lg bg-black/5 px-3 py-2.5">
            <FileText className="h-6 w-6 text-[#d03b3b]" />
            {m.fileData ? (
              <a href={m.fileData} download={m.fileName} className="truncate text-[13px] font-medium hover:underline">
                {m.fileName ?? m.body}
              </a>
            ) : (
              <span className="truncate text-[13px] font-medium">{m.fileName ?? m.body}</span>
            )}
          </div>
        ) : (
          <span className="break-words whitespace-pre-wrap">{waFormat(m.body)}</span>
        )}

        <span className="float-right mt-1 ml-2 flex translate-y-0.5 items-center gap-1 text-[10.5px] text-ink-3">
          {timeHM(m.createdAt)}
          {out && !isNote && <Ticks status={m.status} failed={m.delivery === 'failed' ? (m.deliveryError ?? 'Falha no envio') : undefined} />}
        </span>
      </div>
    </div>
  );
}

function TransferModal({
  open,
  onClose,
  departments,
  users,
  defaultDep,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  departments: { id: string; name: string }[];
  users: { id: string; name: string; departmentIds: string[]; presence: string }[];
  defaultDep?: string;
  onConfirm: (dep: string, user: string) => void;
}) {
  const [dep, setDep] = useState(defaultDep ?? departments[0]?.id ?? '');
  const [user, setUser] = useState('');
  const options = users.filter((u) => u.departmentIds.includes(dep));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transferir atendimento"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!dep}
            onClick={() => {
              onConfirm(dep, user);
              onClose();
            }}
          >
            Transferir
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Departamento / fila">
          <Select value={dep} onChange={(e) => (setDep(e.target.value), setUser(''))}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Atendente" hint="Deixe em branco para enviar para a fila do departamento.">
          <Select value={user} onChange={(e) => setUser(e.target.value)}>
            <option value="">Qualquer atendente (fila)</option>
            {options.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.presence}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
