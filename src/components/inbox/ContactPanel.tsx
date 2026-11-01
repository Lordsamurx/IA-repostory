import { useState, type ReactNode } from 'react';
import { Briefcase, CheckSquare, ChevronDown, Plus, Tag as TagIcon, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Avatar, IconButton, Input, Menu, MenuItem, Select, TagChip, Textarea } from '../ui';
import { cn, dateTimeBR, formatPhone, money, nowIso, uid } from '../../lib/utils';
import { LEAD_SOURCES, type Conversation, type LeadSource } from '../../types';
import CustomFieldInput from '../CustomFieldInput';

function Section({ title, icon, children, action }: { title: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-line px-4 py-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(!open)} className="flex flex-1 items-center gap-2 text-left text-[12px] font-semibold tracking-wide text-ink-2 uppercase">
          <span className="text-ink-3 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
          {title}
          <ChevronDown className={cn('h-3.5 w-3.5 text-ink-3 transition', !open && '-rotate-90')} />
        </button>
        {action}
      </div>
      {open && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

function InlineField({ label, value, onSave, type = 'text' }: { label: string; value?: string; onSave: (v: string) => void; type?: string }) {
  return (
    <label className="flex items-center gap-2 py-0.5">
      <span className="w-20 shrink-0 text-[12px] text-ink-3">{label}</span>
      <input
        type={type}
        defaultValue={value}
        key={value}
        onBlur={(e) => e.target.value !== (value ?? '') && onSave(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder="—"
        className="min-w-0 flex-1 rounded-md border border-transparent px-1.5 py-1 text-[13px] outline-none hover:border-line focus:border-brand-500"
      />
    </label>
  );
}

export default function ContactPanel({ conversation: conv, onClose }: { conversation: Conversation; onClose: () => void }) {
  const contact = useStore((s) => s.contacts.find((c) => c.id === conv.contactId));
  const tags = useStore((s) => s.tags);
  const users = useStore((s) => s.users);
  const allDeals = useStore((s) => s.deals);
  const allTasks = useStore((s) => s.tasks);
  const pipelines = useStore((s) => s.pipelines);
  const connections = useStore((s) => s.connections);
  const departments = useStore((s) => s.departments);
  const sessionUserId = useStore((s) => s.sessionUserId);
  const customFields = useStore((s) => s.customFields);
  const { update, add, toast } = useStore.getState();
  const [taskTitle, setTaskTitle] = useState('');

  if (!contact) return null;
  const deals = allDeals.filter((d) => d.contactId === contact.id);
  const tasks = allTasks.filter((t) => t.contactId === contact.id && !t.done);
  const save = (patch: Partial<typeof contact>) => update('contacts', contact.id, patch);

  const addDeal = () => {
    const p = pipelines[0];
    if (!p) return;
    add('deals', {
      id: uid('dea-'),
      pipelineId: p.id,
      stageId: p.stages[0]!.id,
      contactId: contact.id,
      title: `Oportunidade — ${contact.name}`,
      value: 0,
      ownerId: sessionUserId ?? undefined,
      productIds: [],
      status: 'aberto',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    toast('Negócio criado no funil');
  };

  const addTask = () => {
    if (!taskTitle.trim()) return;
    const due = new Date();
    due.setDate(due.getDate() + 1);
    due.setHours(10, 0, 0, 0);
    add('tasks', {
      id: uid('tsk-'),
      title: taskTitle.trim(),
      type: 'whatsapp',
      priority: 'media',
      dueAt: due.toISOString(),
      done: false,
      contactId: contact.id,
      assigneeId: sessionUserId ?? undefined,
      createdAt: nowIso(),
    });
    setTaskTitle('');
    toast('Tarefa criada para amanhã às 10h');
  };

  const connection = connections.find((c) => c.id === conv.connectionId);
  const department = departments.find((d) => d.id === conv.departmentId);

  return (
    <aside className="hidden w-[320px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface xl:flex">
      <div className="relative flex flex-col items-center border-b border-line px-4 pt-6 pb-4 text-center">
        <IconButton label="Fechar painel" className="absolute top-2 right-2" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
        <Avatar name={contact.name} color={contact.color} size={64} />
        <input
          defaultValue={contact.name}
          key={contact.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== contact.name && save({ name: e.target.value.trim() })}
          className="mt-2 w-full rounded-md border border-transparent px-2 py-0.5 text-center text-[15px] font-semibold outline-none hover:border-line focus:border-brand-500"
          aria-label="Nome do contato"
        />
        <div className="text-[13px] text-ink-3">{formatPhone(contact.phone)}</div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="rounded-md bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink-2">Origem: {contact.source}</span>
        </div>
      </div>

      <Section title="Etiquetas" icon={<TagIcon />}>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags
            .filter((t) => contact.tagIds.includes(t.id))
            .map((t) => (
              <TagChip key={t.id} name={t.name} color={t.color} onRemove={() => save({ tagIds: contact.tagIds.filter((x) => x !== t.id) })} />
            ))}
          <Menu
            align="left"
            trigger={(t) => (
              <button onClick={t} className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] text-ink-3 hover:border-brand-400 hover:text-brand-600">
                <Plus className="h-3 w-3" /> Etiqueta
              </button>
            )}
          >
            {(close) =>
              tags
                .filter((t) => !contact.tagIds.includes(t.id))
                .map((t) => (
                  <MenuItem key={t.id} onClick={() => (save({ tagIds: [...contact.tagIds, t.id] }), close())}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} /> {t.name}
                  </MenuItem>
                ))
            }
          </Menu>
        </div>
      </Section>

      <Section title="Dados do contato">
        <InlineField label="Telefone" value={contact.phone} onSave={(v) => save({ phone: v })} />
        <InlineField label="E-mail" type="email" value={contact.email} onSave={(v) => save({ email: v })} />
        <InlineField label="Empresa" value={contact.company} onSave={(v) => save({ company: v })} />
        <InlineField label="Cidade" value={contact.city} onSave={(v) => save({ city: v })} />
        <label className="flex items-center gap-2 py-0.5">
          <span className="w-20 shrink-0 text-[12px] text-ink-3">Origem</span>
          <Select className="h-8 text-[13px]" value={contact.source} onChange={(e) => save({ source: e.target.value as LeadSource })}>
            {LEAD_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2 py-0.5">
          <span className="w-20 shrink-0 text-[12px] text-ink-3">Dono</span>
          <Select className="h-8 text-[13px]" value={contact.ownerId ?? ''} onChange={(e) => save({ ownerId: e.target.value || undefined })}>
            <option value="">Sem responsável</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </label>
      </Section>

      {customFields.length > 0 && (
        <Section title="Campos personalizados">
          {customFields.map((f) => (
            <label key={f.id} className="flex items-center gap-2 py-0.5">
              <span className="w-20 shrink-0 truncate text-[12px] text-ink-3" title={f.name}>
                {f.name}
              </span>
              <CustomFieldInput compact field={f} value={contact.customFields?.[f.id]} onChange={(v) => save({ customFields: { ...contact.customFields, [f.id]: v } })} />
            </label>
          ))}
        </Section>
      )}

      <Section
        title={`Negócios (${deals.length})`}
        icon={<Briefcase />}
        action={
          <button onClick={addDeal} className="text-[12px] font-medium text-brand-600 hover:underline">
            + Novo
          </button>
        }
      >
        {deals.length === 0 && <p className="text-[12.5px] text-ink-3">Nenhum negócio. Crie um para acompanhar no funil.</p>}
        <div className="space-y-2">
          {deals.map((d) => {
            const p = pipelines.find((x) => x.id === d.pipelineId);
            return (
              <div key={d.id} className="rounded-lg border border-line p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">{d.title}</span>
                  <span className="shrink-0 text-[12px] font-semibold tabular-nums">{money(d.value)}</span>
                </div>
                <div className="mt-2 flex gap-1.5">
                  <Select
                    className="h-7 text-[12px]"
                    value={d.status === 'aberto' ? d.stageId : d.status}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'ganho' || v === 'perdido') useStore.getState().setDealStatus(d.id, v, v === 'perdido' ? 'Não informado' : undefined);
                      else useStore.getState().moveDeal(d.id, v);
                    }}
                  >
                    {p?.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    <option value="ganho">✅ Ganho</option>
                    <option value="perdido">❌ Perdido</option>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title={`Tarefas (${tasks.length})`} icon={<CheckSquare />}>
        <div className="space-y-1.5">
          {tasks.map((t) => (
            <label key={t.id} className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" className="mt-0.5 accent-[var(--brand)]" onChange={() => update('tasks', t.id, { done: true })} />
              <span className="flex-1">
                {t.title}
                <span className={cn('block text-[11px]', new Date(t.dueAt) < new Date() ? 'text-critical' : 'text-ink-3')}>{dateTimeBR(t.dueAt)}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <Input className="h-8 text-[13px]" placeholder="Nova tarefa…" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
        </div>
      </Section>

      <Section title="Anotações">
        <Textarea
          rows={3}
          defaultValue={contact.notes}
          key={contact.id}
          onBlur={(e) => e.target.value !== (contact.notes ?? '') && save({ notes: e.target.value })}
          placeholder="Informações importantes sobre o lead…"
          className="text-[13px]"
        />
      </Section>

      <Section title="Atendimento">
        <dl className="space-y-1 text-[12.5px]">
          <div className="flex justify-between">
            <dt className="text-ink-3">Conexão</dt>
            <dd>{connection?.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-3">Departamento</dt>
            <dd>{department?.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-3">Status</dt>
            <dd className="capitalize">{conv.status.replace('_', ' ')}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-3">Lead desde</dt>
            <dd>{dateTimeBR(contact.createdAt)}</dd>
          </div>
          {conv.followUp && (
            <div className="flex justify-between">
              <dt className="text-ink-3">Follow-up</dt>
              <dd>Passo {conv.followUp.nextStep + 1}</dd>
            </div>
          )}
        </dl>
      </Section>
    </aside>
  );
}
