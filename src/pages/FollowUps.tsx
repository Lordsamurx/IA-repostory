import { useState } from 'react';
import { Clock, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Badge, Button, Card, Confirm, EmptyState, Field, Input, Modal, PageHeader, Select, Switch, Textarea } from '../components/ui';
import { runFollowUps } from '../lib/automation';
import { cn, nowIso, pct, uid } from '../lib/utils';
import type { FollowUp } from '../types';

const UNITS = [
  { v: 1, label: 'minutos' },
  { v: 60, label: 'horas' },
  { v: 1440, label: 'dias' },
];

export function delayLabel(min: number) {
  if (min % 1440 === 0) return `${min / 1440} dia(s)`;
  if (min % 60 === 0) return `${min / 60} hora(s)`;
  return `${min} min`;
}

export default function FollowUps() {
  const flows = useStore((s) => s.followUps);
  const conversations = useStore((s) => s.conversations);
  const { update, remove, toast } = useStore.getState();
  const [editing, setEditing] = useState<FollowUp | null>(null);
  const [deleting, setDeleting] = useState<FollowUp | null>(null);

  const blank = (): FollowUp => ({
    id: uid('fup-'),
    name: 'Nova sequência',
    active: false,
    trigger: 'sem_resposta',
    stopOnReply: true,
    steps: [{ id: uid('fs-'), delayMinutes: 120, message: 'Oi {{nome}}, conseguiu ver minha mensagem?' }],
    sent: 0,
    replied: 0,
    createdAt: nowIso(),
  });

  return (
    <div>
      <PageHeader
        title="Follow-ups automáticos"
        subtitle="Mensagens que saem sozinhas quando o lead para de responder. Param automaticamente quando ele responde."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Play className="h-4 w-4" />}
              onClick={() => {
                const n = runFollowUps();
                toast(n ? `${n} follow-up(s) enviado(s)` : 'Nenhum follow-up vencido agora', n ? 'success' : 'info');
              }}
            >
              Executar agora
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(blank())}>
              Nova sequência
            </Button>
          </>
        }
      />
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div className="rounded-xl border border-line bg-surface p-4 text-[13px] text-ink-2">
          <b>Como funciona:</b> quando a última mensagem da conversa é sua (ou da IA) e o lead não responde, a primeira sequência ativa começa. Cada passo espera o
          tempo configurado desde a mensagem anterior. Se o lead responder, a sequência para. O sistema verifica a cada 30 segundos.
        </div>
        {flows.length === 0 && (
          <Card>
            <EmptyState icon={<Repeat className="h-5 w-5" />} title="Nenhuma sequência" text="Crie uma sequência para recuperar leads que esfriaram." />
          </Card>
        )}
        {flows.map((f, idx) => {
          const enrolled = conversations.filter((c) => c.followUp?.followUpId === f.id && c.status !== 'finalizado').length;
          return (
            <Card key={f.id} className="p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', f.active ? 'bg-brand-500 text-white' : 'bg-canvas text-ink-3')}>
                  <Repeat className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{f.name}</h3>
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    <Badge tone={f.active ? 'good' : 'neutral'}>{f.active ? '● Ativa' : '○ Pausada'}</Badge>
                    <Badge>Gatilho: lead sem resposta</Badge>
                    {idx === flows.findIndex((x) => x.active) && f.active && <Badge tone="brand">Sequência padrão</Badge>}
                  </div>
                </div>
                <div className="flex gap-6 text-center">
                  <div>
                    <div className="text-lg font-semibold tabular-nums">{enrolled}</div>
                    <div className="text-[11px] text-ink-3">Em andamento</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold tabular-nums">{f.sent}</div>
                    <div className="text-[11px] text-ink-3">Enviados</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold tabular-nums">{f.sent ? pct(f.replied / f.sent, 0) : '—'}</div>
                    <div className="text-[11px] text-ink-3">Taxa de resposta</div>
                  </div>
                </div>
                <Switch checked={f.active} label="Ativar" onChange={(v) => update('followUps', f.id, { active: v })} />
                <Button variant="ghost" size="sm" onClick={() => setEditing(f)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleting(f)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <ol className="mt-5 grid gap-3 md:grid-cols-3">
                {f.steps.map((s, i) => (
                  <li key={s.id} className="relative rounded-xl border border-line bg-canvas/50 p-3">
                    <div className="mb-1.5 flex items-center gap-2 text-[12px] font-medium text-ink-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[11px] text-white">{i + 1}</span>
                      <Clock className="h-3.5 w-3.5" /> após {delayLabel(s.delayMinutes)} sem resposta
                    </div>
                    <p className="line-clamp-3 text-[13px]">{s.message}</p>
                  </li>
                ))}
              </ol>
            </Card>
          );
        })}
      </div>
      <FollowUpModal flow={editing} onClose={() => setEditing(null)} />
      <Confirm open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Excluir sequência?" text="Leads em andamento deixam de receber as próximas mensagens." onConfirm={() => (deleting && remove('followUps', deleting.id), toast('Sequência excluída'))} />
    </div>
  );
}

function FollowUpModal({ flow, onClose }: { flow: FollowUp | null; onClose: () => void }) {
  const exists = useStore((s) => s.followUps.some((f) => f.id === flow?.id));
  const { add, update, toast } = useStore.getState();
  const [form, setForm] = useState<FollowUp | null>(flow);
  const [lastId, setLastId] = useState<string | null>(null);
  if ((flow?.id ?? null) !== lastId) {
    setLastId(flow?.id ?? null);
    setForm(flow);
  }
  if (!form) return null;

  const unitOf = (m: number) => (m % 1440 === 0 ? 1440 : m % 60 === 0 ? 60 : 1);
  const setStep = (id: string, patch: Partial<FollowUp['steps'][number]>) => setForm({ ...form, steps: form.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const save = () => {
    if (exists) update('followUps', form.id, form);
    else add('followUps', form);
    toast('Sequência salva');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={exists ? 'Editar sequência' : 'Nova sequência'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!form.name.trim() || form.steps.some((s) => !s.message.trim() || s.delayMinutes <= 0)} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-end gap-4">
          <Field label="Nome" className="flex-1">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <label className="mb-2 flex items-center gap-2 text-[13px]">
            Ativa <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
          </label>
        </div>
        <div className="space-y-3">
          {form.steps.map((s, i) => {
            const unit = unitOf(s.delayMinutes);
            return (
              <div key={s.id} className="rounded-xl border border-line p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-[12px] font-semibold text-white">{i + 1}</span>
                  Enviar após
                  <Input type="number" min={1} className="h-8 w-20" value={s.delayMinutes / unit} onChange={(e) => setStep(s.id, { delayMinutes: Math.max(1, Number(e.target.value)) * unit })} />
                  <Select className="h-8 w-28" value={unit} onChange={(e) => setStep(s.id, { delayMinutes: (s.delayMinutes / unit) * Number(e.target.value) })}>
                    {UNITS.map((u) => (
                      <option key={u.v} value={u.v}>
                        {u.label}
                      </option>
                    ))}
                  </Select>
                  sem resposta
                  <button aria-label="Remover passo" disabled={form.steps.length <= 1} className="ml-auto rounded p-1.5 text-ink-3 hover:text-critical disabled:opacity-30" onClick={() => setForm({ ...form, steps: form.steps.filter((x) => x.id !== s.id) })}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <Textarea rows={2} value={s.message} onChange={(e) => setStep(s.id, { message: e.target.value })} />
              </div>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setForm({ ...form, steps: [...form.steps, { id: uid('fs-'), delayMinutes: 1440, message: '' }] })}
          disabled={form.steps.length >= 6}
        >
          Adicionar passo
        </Button>
        <p className="text-[12px] text-ink-3">Variáveis disponíveis: {'{{nome}}'} e {'{{empresa}}'}. Dica: para testar, use 1 minuto no primeiro passo.</p>
      </div>
    </Modal>
  );
}
