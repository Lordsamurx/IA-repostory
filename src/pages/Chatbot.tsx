import { useState } from 'react';
import { ArrowDown, ArrowUp, Bot, GitBranch, Pencil, Plus, RotateCcw, Send, Trash2, Workflow } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Badge, Button, Card, Confirm, EmptyState, Field, Input, PageHeader, Select, Switch, Textarea } from '../components/ui';
import { previewChatbot } from '../lib/chatbot';
import { cn, nowIso, uid } from '../lib/utils';
import type { BotActionType, BotOption, ChatbotFlow } from '../types';

const ACTIONS: Record<BotActionType, string> = {
  nenhuma: 'Só responder',
  transferir: 'Transferir para departamento',
  etiqueta: 'Adicionar etiqueta',
  funil: 'Criar/mover negócio no funil',
  ia: 'Passar para agente de IA',
  finalizar: 'Finalizar atendimento',
};

export default function Chatbot() {
  const flows = useStore((s) => s.chatbots);
  const connections = useStore((s) => s.connections);
  const { update, remove, toast } = useStore.getState();
  const [editing, setEditing] = useState<ChatbotFlow | null>(null);
  const [deleting, setDeleting] = useState<ChatbotFlow | null>(null);

  const blank = (): ChatbotFlow => ({
    id: uid('bot-'),
    name: 'Menu de boas-vindas',
    active: false,
    connectionIds: connections.slice(0, 1).map((c) => c.id),
    trigger: 'primeira_mensagem',
    keywords: ['menu'],
    greeting: 'Olá, {{nome}}! Que bom ter você aqui 😊 Escolha uma opção:',
    options: [
      { id: uid('bo-'), key: '1', label: 'Conhecer produtos e preços', reply: '', action: 'ia', value: useStore.getState().agents[0]?.id },
      { id: uid('bo-'), key: '2', label: 'Falar com um atendente', reply: 'Certo! Já vou te passar para a equipe.', action: 'transferir', value: useStore.getState().departments[0]?.id },
    ],
    invalidMessage: 'Não entendi 🤔 Responda com o número da opção, por favor.',
    runs: 0,
    createdAt: nowIso(),
  });

  if (editing) return <FlowEditor flow={editing} onClose={() => setEditing(null)} />;

  return (
    <div>
      <PageHeader
        title="Chatbot"
        subtitle="Menus de opções que recebem o cliente, entendem o que ele precisa e direcionam para a fila certa, para a IA ou para o funil"
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(blank())}>
            Novo fluxo
          </Button>
        }
      />
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div className="rounded-xl border border-line bg-surface p-4 text-[13px] text-ink-2">
          <b>Ordem de atendimento:</b> quando chega uma mensagem, primeiro o <b>chatbot</b> (se houver fluxo ativo na conexão), depois o <b>agente de IA</b> e, por fim, a
          <b> fila humana</b>. Se o cliente errar a opção duas vezes, a conversa vai para a fila.
        </div>
        {flows.length === 0 && (
          <Card>
            <EmptyState icon={<Workflow className="h-5 w-5" />} title="Nenhum fluxo criado" text="Crie um menu para organizar a entrada dos leads." action={<Button onClick={() => setEditing(blank())}>Criar fluxo</Button>} />
          </Card>
        )}
        {flows.map((f) => (
          <Card key={f.id} className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', f.active ? 'bg-brand-500 text-white' : 'bg-canvas text-ink-3')}>
                <Workflow className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{f.name}</h3>
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                  <Badge tone={f.active ? 'good' : 'neutral'}>{f.active ? '● Ativo' : '○ Pausado'}</Badge>
                  <Badge>{f.trigger === 'primeira_mensagem' ? 'Primeira mensagem do contato' : `Palavras: ${f.keywords.join(', ')}`}</Badge>
                  <Badge tone="info">{connections.filter((c) => f.connectionIds.includes(c.id)).map((c) => c.name).join(', ') || 'Sem conexão'}</Badge>
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold tabular-nums">{f.runs}</div>
                <div className="text-[11px] text-ink-3">Execuções</div>
              </div>
              <Switch checked={f.active} label="Ativar" onChange={(v) => update('chatbots', f.id, { active: v })} />
              <Button variant="ghost" size="sm" onClick={() => setEditing(f)} aria-label="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleting(f)} aria-label="Excluir">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {f.options.map((o) => (
                <div key={o.id} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-[13px]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-50 font-semibold text-brand-700">{o.key}</span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-ink-3">
                    <GitBranch className="h-3.5 w-3.5" /> {ACTIONS[o.action]}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <Confirm open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Excluir fluxo?" text="Conversas aguardando uma opção deste menu seguem para a fila." onConfirm={() => (deleting && remove('chatbots', deleting.id), toast('Fluxo excluído'))} />
    </div>
  );
}

function FlowEditor({ flow, onClose }: { flow: ChatbotFlow; onClose: () => void }) {
  const connections = useStore((s) => s.connections);
  const departments = useStore((s) => s.departments);
  const tags = useStore((s) => s.tags);
  const pipelines = useStore((s) => s.pipelines);
  const agents = useStore((s) => s.agents);
  const exists = useStore((s) => s.chatbots.some((f) => f.id === flow.id));
  const { add, update, toast } = useStore.getState();
  const [form, setForm] = useState<ChatbotFlow>(flow);
  const [chat, setChat] = useState<{ from: 'bot' | 'user'; text: string; note?: string }[]>([]);
  const [answer, setAnswer] = useState('');

  const setOpt = (id: string, patch: Partial<BotOption>) => setForm({ ...form, options: form.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const renumber = (opts: BotOption[]) => opts.map((o, i) => ({ ...o, key: String(i + 1) }));
  const move = (i: number, dir: -1 | 1) => {
    const copy = [...form.options];
    const [it] = copy.splice(i, 1);
    copy.splice(i + dir, 0, it!);
    setForm({ ...form, options: renumber(copy) });
  };

  const valueOptions = (a: BotActionType) => {
    if (a === 'transferir') return departments.map((d) => ({ id: d.id, label: d.name }));
    if (a === 'etiqueta') return tags.map((t) => ({ id: t.id, label: t.name }));
    if (a === 'funil') return pipelines.flatMap((p) => p.stages.map((s) => ({ id: s.id, label: `${p.name} → ${s.name}` })));
    if (a === 'ia') return agents.map((g) => ({ id: g.id, label: g.name }));
    return [];
  };

  const save = () => {
    if (exists) update('chatbots', form.id, form);
    else add('chatbots', form);
    toast('Fluxo salvo');
    onClose();
  };

  const startTest = () => setChat(previewChatbot(form, null).messages.map((t) => ({ from: 'bot' as const, text: t })));
  const sendTest = () => {
    if (!answer.trim()) return;
    const r = previewChatbot(form, answer);
    const note = r.option ? `➜ ${ACTIONS[r.option.action]}${r.option.value ? `: ${valueOptions(r.option.action).find((v) => v.id === r.option!.value)?.label ?? ''}` : ''}` : undefined;
    setChat((c) => [...c, { from: 'user', text: answer }, ...r.messages.map((t, i) => ({ from: 'bot' as const, text: t, note: i === r.messages.length - 1 ? note : undefined }))]);
    if (!r.messages.length && note) setChat((c) => [...c, { from: 'bot', text: '', note }]);
    setAnswer('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-6 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
          <Workflow className="h-5 w-5" />
        </span>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-lg font-semibold outline-none hover:border-line focus:border-brand-500" aria-label="Nome do fluxo" />
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          Ativo <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
        </label>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={!form.name.trim() || form.options.length === 0 || form.options.some((o) => !o.label.trim())}>
          Salvar fluxo
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5 overflow-y-auto p-6">
          <Card className="space-y-4 p-5">
            <h3 className="font-semibold">Quando iniciar</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Gatilho">
                <Select value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value as ChatbotFlow['trigger'] })}>
                  <option value="primeira_mensagem">Primeira mensagem de um contato</option>
                  <option value="palavra_chave">Mensagem com palavra-chave</option>
                </Select>
              </Field>
              <Field label="Palavras-chave (também reabrem o menu)" hint="Separe por vírgula">
                <Input value={form.keywords.join(', ')} onChange={(e) => setForm({ ...form, keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              </Field>
            </div>
            <Field label="Conexões">
              <div className="flex flex-wrap gap-3">
                {connections.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-[13px]">
                    <input
                      type="checkbox"
                      className="accent-[var(--brand)]"
                      checked={form.connectionIds.includes(c.id)}
                      onChange={(e) => setForm({ ...form, connectionIds: e.target.checked ? [...form.connectionIds, c.id] : form.connectionIds.filter((x) => x !== c.id) })}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </Field>
          </Card>

          <Card className="space-y-4 p-5">
            <h3 className="font-semibold">Mensagem e opções</h3>
            <Field label="Mensagem de abertura" hint="As opções numeradas são adicionadas automaticamente abaixo dela.">
              <Textarea rows={2} value={form.greeting} onChange={(e) => setForm({ ...form, greeting: e.target.value })} />
            </Field>
            <div className="space-y-3">
              {form.options.map((o, i) => {
                const values = valueOptions(o.action);
                return (
                  <div key={o.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 font-semibold text-white">{o.key}</span>
                      <Input value={o.label} placeholder="Texto da opção" onChange={(e) => setOpt(o.id, { label: e.target.value })} />
                      <button aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1.5 text-ink-3 hover:bg-canvas disabled:opacity-30">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button aria-label="Descer" disabled={i === form.options.length - 1} onClick={() => move(i, 1)} className="rounded p-1.5 text-ink-3 hover:bg-canvas disabled:opacity-30">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button aria-label="Remover" onClick={() => setForm({ ...form, options: renumber(form.options.filter((x) => x.id !== o.id)) })} className="rounded p-1.5 text-ink-3 hover:text-critical">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Select value={o.action} onChange={(e) => setOpt(o.id, { action: e.target.value as BotActionType, value: valueOptions(e.target.value as BotActionType)[0]?.id })}>
                        {Object.entries(ACTIONS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </Select>
                      {values.length > 0 ? (
                        <Select value={o.value ?? ''} onChange={(e) => setOpt(o.id, { value: e.target.value })}>
                          {values.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <div />
                      )}
                    </div>
                    <Textarea rows={1} className="mt-2" placeholder="Resposta ao escolher esta opção (opcional)" value={o.reply} onChange={(e) => setOpt(o.id, { reply: e.target.value })} />
                  </div>
                );
              })}
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus className="h-4 w-4" />}
              disabled={form.options.length >= 9}
              onClick={() => setForm({ ...form, options: [...form.options, { id: uid('bo-'), key: String(form.options.length + 1), label: '', reply: '', action: 'nenhuma' }] })}
            >
              Adicionar opção
            </Button>
            <Field label="Resposta para opção inválida">
              <Input value={form.invalidMessage} onChange={(e) => setForm({ ...form, invalidMessage: e.target.value })} />
            </Field>
          </Card>
        </div>

        <aside className="flex min-h-[480px] flex-col border-l border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2 text-[14px] font-semibold">
              <Bot className="h-4 w-4 text-brand-600" /> Testar fluxo
            </div>
            <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={startTest}>
              Reiniciar
            </Button>
          </div>
          <div className="chat-wallpaper flex-1 space-y-2 overflow-y-auto p-4">
            {chat.length === 0 && (
              <div className="mt-10 text-center">
                <Button size="sm" onClick={startTest}>
                  Simular primeira mensagem
                </Button>
              </div>
            )}
            {chat.map((m, i) => (
              <div key={i} className={cn('flex flex-col', m.from === 'user' ? 'items-start' : 'items-end')}>
                {m.text && <div className={cn('max-w-[88%] rounded-xl px-3 py-2 text-[13px] whitespace-pre-wrap shadow-sm', m.from === 'user' ? 'bg-white' : 'bg-bubble-out')}>{m.text.replace(/\*/g, '')}</div>}
                {m.note && <div className="mt-1 rounded-md bg-[#e1f0f7] px-2 py-0.5 text-[11px] text-[#35586b]">{m.note}</div>}
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t border-line p-3">
            <Input value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendTest()} placeholder="Resposta do cliente (ex.: 1)" disabled={chat.length === 0} />
            <Button onClick={sendTest} disabled={!answer.trim() || chat.length === 0} aria-label="Enviar">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
