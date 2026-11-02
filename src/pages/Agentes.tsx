import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Bot, Copy, MessageSquare, Pencil, Plus, RotateCcw, Send, Sparkles, Trash2, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Badge, Button, Card, Confirm, EmptyState, Field, Input, PageHeader, Select, Switch, Tabs, Textarea } from '../components/ui';
import { checkServerAI, previewAgent } from '../lib/ai';
import { cn, nowIso, uid } from '../lib/utils';
import type { Agent, Weekday } from '../types';

const TONES: Record<Agent['tone'], string> = {
  amigavel: 'Amigável e acolhedor',
  profissional: 'Profissional e formal',
  descontraido: 'Descontraído, com emojis',
  objetivo: 'Direto ao ponto',
};

const MODELS = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — rápido e econômico' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — equilíbrio' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — máxima qualidade' },
  { id: 'gpt-4o-mini', label: 'OpenAI GPT-4o mini' },
];

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function Agentes() {
  const agents = useStore((s) => s.agents);
  const conversations = useStore((s) => s.conversations);
  const messages = useStore((s) => s.messages);
  const connections = useStore((s) => s.connections);
  const { update, add, remove, toast } = useStore.getState();
  const [editing, setEditing] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState<Agent | null>(null);
  const [serverAI, setServerAI] = useState<boolean | null>(null);

  useEffect(() => {
    void checkServerAI().then(setServerAI);
  }, []);

  const newAgent = (): Agent => ({
    id: uid('agt-'),
    name: 'Novo agente',
    objective: 'Responder dúvidas e qualificar o lead antes de passar para o time comercial.',
    tone: 'amigavel',
    prompt:
      'Você é o assistente virtual da {{empresa}}. Responda em português do Brasil com mensagens curtas. Use somente as informações da base de conhecimento e nunca invente preços. Se o cliente pedir para falar com uma pessoa, transfira.',
    greeting: 'Olá, {{nome}}! Sou o assistente virtual da {{empresa}}. Como posso ajudar?',
    model: 'claude-haiku-5-5',
    temperature: 0.4,
    active: false,
    knowledgeIds: useStore.getState().knowledge.map((k) => k.id),
    connectionIds: connections.slice(0, 1).map((c) => c.id),
    qualification: ['Qual produto ou serviço você procura?', 'Qual o melhor horário para falarmos?'],
    maxDiscount: 0,
    schedule: { enabled: false, start: '18:00', end: '08:00', days: [0, 1, 2, 3, 4, 5, 6] },
    handoff: { keywords: ['atendente', 'humano', 'pessoa'], maxReplies: 8, departmentId: useStore.getState().departments[0]?.id, message: 'Vou te transferir para um especialista, só um instante 🙂' },
    createdAt: nowIso(),
  });

  if (editing) return <AgentEditor agent={editing} onClose={() => setEditing(null)} />;

  return (
    <div>
      <PageHeader
        title="Agentes de IA"
        subtitle="Atendentes virtuais que respondem no WhatsApp 24h, qualificam o lead e transferem para o time na hora certa"
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(newAgent())}>
            Criar agente
          </Button>
        }
      />
      <div className="p-6">
        {serverAI === false && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-[color-mix(in_oklab,var(--warning)_35%,var(--line))] bg-[color-mix(in_oklab,var(--warning)_14%,var(--surface))] p-4 text-[13px] text-[color-mix(in_oklab,var(--warning)_80%,var(--ink))]">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <b>Motor local ativo.</b> Os agentes respondem pela base de conhecimento, perguntas de qualificação e regras de transferência. Para respostas geradas por um modelo de IA
              (Claude ou GPT), configure <code className="rounded bg-surface px-1">AI_API_KEY</code> no servidor — veja o README.
            </div>
          </div>
        )}
        {serverAI && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50 p-3 text-[13px] text-brand-800">
            <Sparkles className="h-4 w-4" /> Modelo de IA conectado pelo servidor. As respostas são geradas em tempo real.
          </div>
        )}
        {agents.length === 0 ? (
          <Card>
            <EmptyState icon={<Bot className="h-5 w-5" />} title="Nenhum agente criado" text="Crie seu primeiro agente para atender leads automaticamente." action={<Button onClick={() => setEditing(newAgent())}>Criar agente</Button>} />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {agents.map((a) => {
              const convs = conversations.filter((c) => c.agentId === a.id);
              const replies = messages.filter((m) => m.author === 'ai' && convs.some((c) => c.id === m.conversationId)).length;
              const handoffs = messages.filter((m) => m.kind === 'system' && m.body.startsWith('Transferido') && convs.some((c) => c.id === m.conversationId)).length;
              return (
                <Card key={a.id} className="flex flex-col p-5">
                  <div className="flex items-start gap-3">
                    <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', a.active ? 'bg-brand-500 text-white' : 'bg-canvas text-ink-3')}>
                      <Bot className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold">{a.name}</h3>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={a.active ? 'good' : 'neutral'}>{a.active ? '● Ativo' : '○ Pausado'}</Badge>
                        <Badge>{MODELS.find((m) => m.id === a.model)?.label.split('—')[0] ?? a.model}</Badge>
                        {a.schedule.enabled && (
                          <Badge tone="info">
                            {a.schedule.start}–{a.schedule.end}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Switch checked={a.active} label="Ativar agente" onChange={(v) => (update('agents', a.id, { active: v }), toast(v ? 'Agente ativado' : 'Agente pausado'))} />
                  </div>
                  <p className="mt-3 line-clamp-2 flex-1 text-[13px] text-ink-2">{a.objective}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-canvas p-3 text-center">
                    <div>
                      <div className="text-lg font-semibold tabular-nums">{convs.length}</div>
                      <div className="text-[11px] text-ink-3">Conversas</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold tabular-nums">{replies}</div>
                      <div className="text-[11px] text-ink-3">Respostas</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold tabular-nums">{handoffs}</div>
                      <div className="text-[11px] text-ink-3">Transferências</div>
                    </div>
                  </div>
                  <div className="mt-3 text-[12px] text-ink-3">
                    Atende em: {connections.filter((c) => a.connectionIds.includes(c.id)).map((c) => c.name).join(', ') || 'nenhuma conexão'}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button variant="secondary" size="sm" className="flex-1" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(a)}>
                      Configurar e testar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Duplicar"
                      onClick={() => {
                        add('agents', { ...a, id: uid('agt-'), name: `${a.name} (cópia)`, active: false, createdAt: nowIso() });
                        toast('Agente duplicado');
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Excluir" onClick={() => setDeleting(a)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      <Confirm
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Excluir agente?"
        text="Conversas atendidas por ele passam a ser respondidas só por humanos."
        onConfirm={() => {
          if (!deleting) return;
          for (const c of conversations.filter((x) => x.agentId === deleting.id)) update('conversations', c.id, { aiEnabled: false, agentId: undefined });
          remove('agents', deleting.id);
          toast('Agente excluído');
        }}
      />
    </div>
  );
}

type Tab = 'identidade' | 'conhecimento' | 'qualificacao' | 'transbordo' | 'canais';

function AgentEditor({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const knowledge = useStore((s) => s.knowledge);
  const connections = useStore((s) => s.connections);
  const departments = useStore((s) => s.departments);
  const exists = useStore((s) => s.agents.some((a) => a.id === agent.id));
  const { add, update, toast } = useStore.getState();
  const [form, setForm] = useState<Agent>(agent);
  const [tab, setTab] = useState<Tab>('identidade');
  const [newQ, setNewQ] = useState('');
  const set = (patch: Partial<Agent>) => setForm((f) => ({ ...f, ...patch }));

  const save = () => {
    if (exists) update('agents', form.id, form);
    else add('agents', form);
    toast('Agente salvo');
    onClose();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-6 py-3">
        <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-canvas" aria-label="Voltar">
          <X className="h-5 w-5" />
        </button>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
          <Bot className="h-5 w-5" />
        </span>
        <input value={form.name} onChange={(e) => set({ name: e.target.value })} className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-lg font-semibold outline-none hover:border-line focus:border-brand-500" aria-label="Nome do agente" />
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          Ativo <Switch checked={form.active} onChange={(v) => set({ active: v })} />
        </label>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={save}>Salvar agente</Button>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_400px]">
        <div className="overflow-y-auto p-6">
          <Tabs
            value={tab}
            onChange={setTab}
            className="mb-5"
            items={[
              { value: 'identidade', label: 'Identidade e prompt' },
              { value: 'conhecimento', label: 'Conhecimento', count: form.knowledgeIds.length },
              { value: 'qualificacao', label: 'Qualificação e vendas' },
              { value: 'transbordo', label: 'Transferir para humano' },
              { value: 'canais', label: 'Horário e canais' },
            ]}
          />

          {tab === 'identidade' && (
            <div className="max-w-2xl space-y-4">
              <Field label="Objetivo do agente" hint="Em uma frase: quem escreve, o que o agente responde e quando passa para humano.">
                <Textarea rows={2} value={form.objective} onChange={(e) => set({ objective: e.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tom de voz">
                  <Select value={form.tone} onChange={(e) => set({ tone: e.target.value as Agent['tone'] })}>
                    {Object.entries(TONES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Modelo de IA">
                  <Select value={form.model} onChange={(e) => set({ model: e.target.value })}>
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Mensagem de boas-vindas" hint="Variáveis: {{nome}} e {{empresa}}">
                <Textarea rows={2} value={form.greeting} onChange={(e) => set({ greeting: e.target.value })} />
              </Field>
              <Field label="Instruções (prompt)" hint="Regras de comportamento. Diga o que o agente pode e não pode fazer.">
                <Textarea rows={9} value={form.prompt} onChange={(e) => set({ prompt: e.target.value })} className="font-mono text-[12.5px]" />
              </Field>
              <Field label={`Criatividade: ${form.temperature.toFixed(1)}`} hint="Usado nos modelos OpenAI. Os modelos Claude ajustam isso sozinhos.">
                <input type="range" min={0} max={1} step={0.1} value={form.temperature} onChange={(e) => set({ temperature: Number(e.target.value) })} className="w-full accent-[var(--brand)]" />
              </Field>
            </div>
          )}

          {tab === 'conhecimento' && (
            <div className="max-w-2xl">
              <p className="mb-3 text-[13px] text-ink-3">Marque o que este agente pode usar para responder. Gerencie os conteúdos no menu Base de conhecimento.</p>
              <Card className="divide-y divide-line">
                {knowledge.length === 0 && <p className="p-4 text-[13px] text-ink-3">Base de conhecimento vazia.</p>}
                {knowledge.map((k) => (
                  <label key={k.id} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-canvas/60">
                    <input
                      type="checkbox"
                      className="mt-1 accent-[var(--brand)]"
                      checked={form.knowledgeIds.includes(k.id)}
                      onChange={(e) => set({ knowledgeIds: e.target.checked ? [...form.knowledgeIds, k.id] : form.knowledgeIds.filter((x) => x !== k.id) })}
                    />
                    <span>
                      <span className="block text-[13.5px] font-medium">{k.title}</span>
                      <span className="line-clamp-1 text-[12.5px] text-ink-3">{k.content}</span>
                    </span>
                  </label>
                ))}
              </Card>
            </div>
          )}

          {tab === 'qualificacao' && (
            <div className="max-w-2xl space-y-5">
              <Field label="Perguntas de qualificação" hint="O agente faz uma de cada vez, na ordem, quando não há uma dúvida para responder.">
                <div className="space-y-2">
                  {form.qualification.map((q, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand-700">{i + 1}</span>
                      <Input value={q} onChange={(e) => set({ qualification: form.qualification.map((x, j) => (j === i ? e.target.value : x)) })} />
                      <button aria-label="Remover" onClick={() => set({ qualification: form.qualification.filter((_, j) => j !== i) })} className="rounded p-1.5 text-ink-3 hover:text-critical">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input placeholder="Nova pergunta…" value={newQ} onChange={(e) => setNewQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newQ.trim() && (set({ qualification: [...form.qualification, newQ.trim()] }), setNewQ(''))} />
                    <Button variant="secondary" disabled={!newQ.trim()} onClick={() => (set({ qualification: [...form.qualification, newQ.trim()] }), setNewQ(''))}>
                      Adicionar
                    </Button>
                  </div>
                </div>
              </Field>
              <Field label="Desconto máximo que a IA pode oferecer (%)" hint="Acima disso o agente transfere para um vendedor.">
                <Input type="number" min={0} max={50} value={form.maxDiscount} onChange={(e) => set({ maxDiscount: Number(e.target.value) })} className="w-32" />
              </Field>
            </div>
          )}

          {tab === 'transbordo' && (
            <div className="max-w-2xl space-y-4">
              <Field label="Palavras que pedem atendimento humano" hint="Separe por vírgula. Se o cliente usar alguma, o agente transfere na hora.">
                <Input value={form.handoff.keywords.join(', ')} onChange={(e) => set({ handoff: { ...form.handoff, keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Transferir após N respostas da IA">
                  <Input type="number" min={1} max={50} value={form.handoff.maxReplies} onChange={(e) => set({ handoff: { ...form.handoff, maxReplies: Number(e.target.value) } })} />
                </Field>
                <Field label="Enviar para o departamento">
                  <Select value={form.handoff.departmentId ?? ''} onChange={(e) => set({ handoff: { ...form.handoff, departmentId: e.target.value } })}>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Mensagem ao transferir">
                <Textarea rows={2} value={form.handoff.message} onChange={(e) => set({ handoff: { ...form.handoff, message: e.target.value } })} />
              </Field>
              <div className="flex gap-3 rounded-xl bg-canvas p-4 text-[13px] text-ink-2">
                <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                Ao transferir, a conversa entra na fila do departamento, a IA é pausada e a equipe recebe uma notificação. Se um atendente responder manualmente, a IA também pausa.
              </div>
            </div>
          )}

          {tab === 'canais' && (
            <div className="max-w-2xl space-y-5">
              <Field label="Conexões de WhatsApp atendidas" hint="Conversas novas nessas conexões já começam com este agente.">
                <div className="space-y-2">
                  {connections.map((c) => (
                    <label key={c.id} className="flex items-center gap-2.5 text-[13.5px]">
                      <input
                        type="checkbox"
                        className="accent-[var(--brand)]"
                        checked={form.connectionIds.includes(c.id)}
                        onChange={(e) => set({ connectionIds: e.target.checked ? [...form.connectionIds, c.id] : form.connectionIds.filter((x) => x !== c.id) })}
                      />
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} /> {c.name}
                    </label>
                  ))}
                  {connections.length === 0 && <p className="text-[13px] text-ink-3">Nenhuma conexão. Conecte um WhatsApp no menu Conexões.</p>}
                </div>
              </Field>
              <div className="rounded-xl border border-line p-4">
                <label className="flex items-center justify-between">
                  <span>
                    <span className="block text-[13.5px] font-medium">Atender só em um horário</span>
                    <span className="text-[12.5px] text-ink-3">Ex.: plantão noturno das 19h às 8h. Desligado = atende 24h.</span>
                  </span>
                  <Switch checked={form.schedule.enabled} onChange={(v) => set({ schedule: { ...form.schedule, enabled: v } })} />
                </label>
                {form.schedule.enabled && (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Das">
                        <Input type="time" value={form.schedule.start} onChange={(e) => set({ schedule: { ...form.schedule, start: e.target.value } })} />
                      </Field>
                      <Field label="Até">
                        <Input type="time" value={form.schedule.end} onChange={(e) => set({ schedule: { ...form.schedule, end: e.target.value } })} />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {DAYS.map((d, i) => {
                        const on = form.schedule.days.includes(i as Weekday);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => set({ schedule: { ...form.schedule, days: on ? form.schedule.days.filter((x) => x !== i) : ([...form.schedule.days, i as Weekday].sort() as Weekday[]) } })}
                            className={cn('h-8 w-11 rounded-lg border text-[12.5px]', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-line text-ink-2')}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <Playground agent={form} />
      </div>
    </div>
  );
}

function Playground({ agent }: { agent: Agent }) {
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string; handoff?: boolean }[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [history, busy]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    const next = [...history, { role: 'user' as const, content: t }];
    setHistory(next);
    setText('');
    setBusy(true);
    const r = await previewAgent(agent, next);
    setBusy(false);
    setHistory([...next, { role: 'assistant', content: r.text, handoff: r.handoff }]);
  };

  return (
    <aside className="flex min-h-[480px] flex-col border-l border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <MessageSquare className="h-4 w-4 text-brand-600" /> Testar agente
          </div>
          <div className="text-[12px] text-ink-3">Usa a configuração atual, mesmo sem salvar.</div>
        </div>
        <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setHistory([])}>
          Limpar
        </Button>
      </div>
      <div ref={ref} className="chat-wallpaper flex-1 space-y-2 overflow-y-auto p-4">
        {history.length === 0 && <p className="mt-10 text-center text-[13px] text-ink-3">Escreva como se fosse um cliente no WhatsApp. Ex.: “quanto custa o implante?”</p>}
        {history.map((h, i) => (
          <div key={i} className={cn('flex', h.role === 'user' ? 'justify-start' : 'justify-end')}>
            <div className={cn('max-w-[85%] rounded-xl px-3 py-2 text-[13.5px] whitespace-pre-wrap shadow-sm', h.role === 'user' ? 'bg-bubble-in' : 'bg-bubble-out')}>
              {h.content}
              {h.handoff && <div className="mt-1 text-[11px] font-medium text-[color-mix(in_oklab,var(--warning)_80%,var(--ink))]">↪ Transferiria para humano</div>}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-end">
            <div className="flex gap-0.5 rounded-xl bg-bubble-out px-3 py-3">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-3" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-3" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-3" />
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t border-line p-3">
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Mensagem do cliente…" />
        <Button onClick={send} disabled={!text.trim() || busy} aria-label="Enviar">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}
