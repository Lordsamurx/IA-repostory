import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Copy, Megaphone, Pause, Pencil, Play, Plus, Send, Trash2, Users } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Badge, Button, Card, Confirm, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea } from '../components/ui';
import { audienceOf, pauseBroadcast, startBroadcast } from '../lib/broadcast';
import { cn, dateTimeBR, fillTemplate, firstName, nowIso, pct, uid } from '../lib/utils';
import { LEAD_SOURCES, type Broadcast, type BroadcastStatus, type LeadSource } from '../types';

const STATUS: Record<BroadcastStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'good' | 'brand' }> = {
  rascunho: { label: 'Rascunho', tone: 'neutral' },
  agendado: { label: 'Agendado', tone: 'info' },
  enviando: { label: 'Enviando…', tone: 'brand' },
  pausado: { label: 'Pausado', tone: 'warning' },
  concluido: { label: 'Concluído', tone: 'good' },
};

export default function Disparos() {
  const broadcasts = useStore((s) => s.broadcasts);
  const connections = useStore((s) => s.connections);
  const me = useStore((s) => s.users.find((u) => u.id === s.sessionUserId));
  const { add, remove, update, toast } = useStore.getState();
  const [editing, setEditing] = useState<Broadcast | null>(null);
  const [deleting, setDeleting] = useState<Broadcast | null>(null);
  const isAdmin = me?.role === 'admin';

  const blank = (): Broadcast => ({
    id: uid('brd-'),
    name: 'Novo disparo',
    connectionId: connections.find((c) => c.status === 'conectado')?.id ?? connections[0]?.id ?? '',
    message: 'Olá {{nome}}! ',
    audience: { tagIds: [], sources: [], stageIds: [] },
    recipients: [],
    intervalSec: 20,
    status: 'rascunho',
    sent: 0,
    replied: 0,
    createdAt: nowIso(),
  });

  const sorted = [...broadcasts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div>
      <PageHeader
        title="Disparos"
        subtitle="Envie uma mensagem para vários contatos de uma vez, segmentando por etiqueta, origem ou etapa do funil"
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(blank())} disabled={!isAdmin}>
            Novo disparo
          </Button>
        }
      />
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div className="flex gap-3 rounded-xl border border-[color-mix(in_oklab,var(--warning)_35%,var(--line))] bg-[color-mix(in_oklab,var(--warning)_14%,var(--surface))] p-4 text-[13px] text-[color-mix(in_oklab,var(--warning)_80%,var(--ink))]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Disparos em massa por conexão de <b>QR Code</b> aumentam o risco de banimento do número. Use intervalos de pelo menos 15 segundos, envie só para
            quem já conversou com você e, para volumes maiores, prefira a <b>API oficial</b> com modelos de mensagem aprovados pela Meta.
          </div>
        </div>

        {sorted.length === 0 && (
          <Card>
            <EmptyState icon={<Megaphone className="h-5 w-5" />} title="Nenhum disparo ainda" text="Crie um disparo para avisar promoções, lembretes ou novidades." />
          </Card>
        )}

        {sorted.map((b) => {
          const conn = connections.find((c) => c.id === b.connectionId);
          const total = b.recipients.length;
          const progress = total ? b.sent / total : 0;
          return (
            <Card key={b.id} className="p-5">
              <div className="flex flex-wrap items-start gap-3">
                <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', b.status === 'enviando' ? 'bg-brand-500 text-white' : 'bg-canvas text-ink-3')}>
                  <Megaphone className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{b.name}</h3>
                    <Badge tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-ink-3">
                    <span>Conexão: {conn?.name ?? '—'}</span>
                    <span>Intervalo: ~{b.intervalSec}s</span>
                    {b.status === 'agendado' && b.scheduledAt && <span>Agendado para {dateTimeBR(b.scheduledAt)}</span>}
                    {b.finishedAt && <span>Concluído em {dateTimeBR(b.finishedAt)}</span>}
                  </div>
                </div>
                <div className="flex gap-6 text-center">
                  <div>
                    <div className="text-lg font-semibold tabular-nums">
                      {b.sent}
                      {total ? <span className="text-[13px] font-normal text-ink-3">/{total}</span> : null}
                    </div>
                    <div className="text-[11px] text-ink-3">Enviadas</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold tabular-nums">{b.replied}</div>
                    <div className="text-[11px] text-ink-3">Respostas</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold tabular-nums">{b.sent ? pct(b.replied / b.sent, 0) : '—'}</div>
                    <div className="text-[11px] text-ink-3">Taxa</div>
                  </div>
                </div>
              </div>

              <p className="mt-3 line-clamp-2 rounded-lg bg-canvas px-3 py-2 text-[13px] text-ink-2">{b.message}</p>

              {(b.status === 'enviando' || b.status === 'pausado') && (
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress * 100}%` }} />
                  </div>
                  <div className="mt-1 text-[11.5px] text-ink-3">{pct(progress, 0)} enviado · mantenha o CRM aberto até concluir</div>
                </div>
              )}

              {isAdmin && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {(b.status === 'rascunho' || b.status === 'agendado') && (
                    <>
                      <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(b)}>
                        Editar
                      </Button>
                      <Button size="sm" icon={<Send className="h-4 w-4" />} onClick={() => (startBroadcast(b.id), toast('Disparo iniciado'))}>
                        Enviar agora
                      </Button>
                    </>
                  )}
                  {b.status === 'enviando' && (
                    <Button size="sm" variant="secondary" icon={<Pause className="h-4 w-4" />} onClick={() => pauseBroadcast(b.id)}>
                      Pausar
                    </Button>
                  )}
                  {b.status === 'pausado' && (
                    <Button size="sm" icon={<Play className="h-4 w-4" />} onClick={() => (update('broadcasts', b.id, { status: 'enviando' }), startBroadcast(b.id))}>
                      Retomar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Copy className="h-4 w-4" />}
                    onClick={() => (add('broadcasts', { ...b, id: uid('brd-'), name: `${b.name} (cópia)`, status: 'rascunho', sent: 0, replied: 0, recipients: [], startedAt: undefined, finishedAt: undefined, scheduledAt: undefined, createdAt: nowIso() }), toast('Disparo duplicado'))}
                  >
                    Duplicar
                  </Button>
                  {b.status !== 'enviando' && (
                    <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(b)}>
                      Excluir
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {editing && <BroadcastModal broadcast={editing} onClose={() => setEditing(null)} />}
      <Confirm open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Excluir disparo?" text="O histórico de mensagens já enviadas continua nas conversas." onConfirm={() => (deleting && remove('broadcasts', deleting.id), toast('Disparo excluído'))} />
    </div>
  );
}

function BroadcastModal({ broadcast, onClose }: { broadcast: Broadcast; onClose: () => void }) {
  const connections = useStore((s) => s.connections);
  const tags = useStore((s) => s.tags);
  const pipelines = useStore((s) => s.pipelines);
  const contacts = useStore((s) => s.contacts);
  const deals = useStore((s) => s.deals);
  const companyName = useStore((s) => s.settings.companyName);
  const exists = useStore((s) => s.broadcasts.some((b) => b.id === broadcast.id));
  const { add, update, toast } = useStore.getState();
  const [form, setForm] = useState<Broadcast>(broadcast);
  const [when, setWhen] = useState<'agora' | 'agendar'>(broadcast.scheduledAt ? 'agendar' : 'agora');
  const [at, setAt] = useState(() => {
    const d = broadcast.scheduledAt ? new Date(broadcast.scheduledAt) : new Date(Date.now() + 3_600_000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });

  const audience = useMemo(() => audienceOf(form, contacts, deals), [form, contacts, deals]);
  const toggle = <K extends keyof Broadcast['audience']>(k: K, v: Broadcast['audience'][K][number]) => {
    const list = form.audience[k] as string[];
    setForm({ ...form, audience: { ...form.audience, [k]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] } });
  };
  const sample = audience[0];

  const save = (start: boolean) => {
    const final: Broadcast = {
      ...form,
      recipients: audience.map((c) => c.id),
      status: when === 'agendar' ? 'agendado' : 'rascunho',
      scheduledAt: when === 'agendar' ? new Date(at).toISOString() : undefined,
    };
    if (exists) update('broadcasts', final.id, final);
    else add('broadcasts', final);
    if (start && when === 'agora') {
      startBroadcast(final.id);
      toast(`Enviando para ${audience.length} contato(s)`);
    } else toast(when === 'agendar' ? 'Disparo agendado' : 'Rascunho salvo');
    onClose();
  };

  const chip = (on: boolean) => cn('rounded-full border px-2.5 py-0.5 text-[12px]', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-line text-ink-2 hover:border-brand-300');

  return (
    <Modal
      open
      onClose={onClose}
      title={exists ? 'Editar disparo' : 'Novo disparo'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => save(false)} disabled={!form.name.trim() || !form.message.trim()}>
            {when === 'agendar' ? 'Agendar' : 'Salvar rascunho'}
          </Button>
          {when === 'agora' && (
            <Button icon={<Send className="h-4 w-4" />} onClick={() => save(true)} disabled={!form.name.trim() || !form.message.trim() || audience.length === 0}>
              Enviar para {audience.length}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do disparo">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Enviar pela conexão">
              <Select value={form.connectionId} onChange={(e) => setForm({ ...form, connectionId: e.target.value })}>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.type === 'qrcode' ? '(QR Code)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="rounded-xl border border-line p-4">
            <div className="mb-3 flex items-center gap-2 text-[13.5px] font-semibold">
              <Users className="h-4 w-4 text-brand-600" /> Público
              <span className="ml-auto text-[12.5px] font-normal text-ink-3">Sem filtros = todos os contatos</span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 text-[12px] text-ink-3">Etiquetas (qualquer uma)</div>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <button key={t.id} className={chip(form.audience.tagIds.includes(t.id))} onClick={() => toggle('tagIds', t.id)}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[12px] text-ink-3">Origem</div>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_SOURCES.map((s) => (
                    <button key={s} className={chip(form.audience.sources.includes(s))} onClick={() => toggle('sources', s as LeadSource)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[12px] text-ink-3">Com negócio aberto na etapa</div>
                <div className="flex flex-wrap gap-1.5">
                  {pipelines.flatMap((p) =>
                    p.stages.map((st) => (
                      <button key={st.id} className={chip(form.audience.stageIds.includes(st.id))} onClick={() => toggle('stageIds', st.id)}>
                        {pipelines.length > 1 ? `${p.name}: ` : ''}
                        {st.name}
                      </button>
                    )),
                  )}
                </div>
              </div>
            </div>
          </div>

          <Field label="Mensagem" hint="Variáveis: {{nome}} e {{empresa}}. Use *texto* para negrito no WhatsApp.">
            <Textarea rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </Field>

          {connections.find((c) => c.id === form.connectionId)?.type === 'api_oficial' && (
            <Field
              label="Nome do Template aprovado na Meta (HSM)"
              hint="Obrigatório na API Oficial para contatos fora da janela de 24h (ex.: promo_clientes_v1)."
            >
              <Input
                value={form.templateName ?? ''}
                onChange={(e) => setForm({ ...form, templateName: e.target.value.trim() || undefined })}
                placeholder="ex.: comunicado_oficial"
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Intervalo entre mensagens: ~${form.intervalSec}s`} hint="Varia ±30% para parecer envio humano.">
              <input type="range" min={5} max={120} step={5} value={form.intervalSec} onChange={(e) => setForm({ ...form, intervalSec: Number(e.target.value) })} className="w-full accent-[var(--brand)]" />
            </Field>
            <Field label="Quando enviar">
              <div className="flex gap-2">
                <Select value={when} onChange={(e) => setWhen(e.target.value as 'agora' | 'agendar')} className="w-36">
                  <option value="agora">Agora</option>
                  <option value="agendar">Agendar</option>
                </Select>
                {when === 'agendar' && <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />}
              </div>
            </Field>
          </div>
        </div>

        <aside>
          <div className="rounded-xl bg-canvas p-4 text-center">
            <div className="text-3xl font-semibold tabular-nums">{audience.length}</div>
            <div className="text-[12.5px] text-ink-3">contato(s) vão receber</div>
            <div className="mt-2 flex items-center justify-center gap-1 text-[12px] text-ink-3">
              <CalendarClock className="h-3.5 w-3.5" /> duração estimada: ~{Math.ceil((audience.length * form.intervalSec) / 60)} min
            </div>
          </div>
          <div className="mt-4 text-[12px] font-medium text-ink-3 uppercase">Pré-visualização</div>
          <div className="chat-wallpaper mt-2 rounded-xl p-3">
            <div className="ml-auto max-w-[90%] rounded-xl rounded-tr-sm bg-bubble-out px-3 py-2 text-[13px] whitespace-pre-wrap shadow-sm">
              {fillTemplate(form.message, { nome: sample ? firstName(sample.name) : 'Maria', empresa: companyName }) || '…'}
            </div>
          </div>
          {audience.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto text-[12px] text-ink-2">
              {audience.slice(0, 30).map((c) => (
                <div key={c.id} className="truncate">
                  • {c.name}
                </div>
              ))}
              {audience.length > 30 && <div className="text-ink-3">+ {audience.length - 30} outros</div>}
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
}
