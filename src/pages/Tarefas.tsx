import { useMemo, useState } from 'react';
import { Calendar, CheckSquare, Mail, MessageCircle, Pencil, Phone, Plus, Trash2, Users as UsersIcon } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea } from '../components/ui';
import { cn, dateTimeBR, dayDiff, nowIso, uid } from '../lib/utils';
import type { Priority, Task, TaskType } from '../types';

const TYPE: Record<TaskType, { label: string; icon: typeof Phone }> = {
  ligacao: { label: 'Ligação', icon: Phone },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  reuniao: { label: 'Reunião', icon: UsersIcon },
  email: { label: 'E-mail', icon: Mail },
  outro: { label: 'Outro', icon: Calendar },
};
const PRIORITY: Record<Priority, { label: string; tone: 'critical' | 'warning' | 'neutral' }> = {
  alta: { label: 'Alta', tone: 'critical' },
  media: { label: 'Média', tone: 'warning' },
  baixa: { label: 'Baixa', tone: 'neutral' },
};

type View = 'minhas' | 'todas' | 'concluidas';

export default function Tarefas() {
  const tasks = useStore((s) => s.tasks);
  const contacts = useStore((s) => s.contacts);
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.sessionUserId);
  const { update, remove, toast } = useStore.getState();
  const [view, setView] = useState<View>('minhas');
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useMemo(
    () =>
      tasks
        .filter((t) => (view === 'concluidas' ? t.done : !t.done) && (view !== 'minhas' || t.assigneeId === me))
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    [tasks, view, me],
  );

  const groups = useMemo(() => {
    if (view === 'concluidas') return [{ label: 'Concluídas', items: [...list].reverse(), tone: 'text-ink-3' }];
    const g = [
      { label: 'Atrasadas', items: [] as Task[], tone: 'text-critical' },
      { label: 'Hoje', items: [] as Task[], tone: 'text-brand-700' },
      { label: 'Amanhã', items: [] as Task[], tone: 'text-ink' },
      { label: 'Próximos dias', items: [] as Task[], tone: 'text-ink-2' },
    ];
    const now = Date.now();
    for (const t of list) {
      const d = dayDiff(t.dueAt);
      if (new Date(t.dueAt).getTime() < now) g[0]!.items.push(t);
      else if (d === 0) g[1]!.items.push(t);
      else if (d === 1) g[2]!.items.push(t);
      else g[3]!.items.push(t);
    }
    return g.filter((x) => x.items.length);
  }, [list, view]);

  const counts = {
    minhas: tasks.filter((t) => !t.done && t.assigneeId === me).length,
    todas: tasks.filter((t) => !t.done).length,
    concluidas: tasks.filter((t) => t.done).length,
  };

  return (
    <div>
      <PageHeader
        title="Tarefas"
        subtitle="Follow-ups manuais, ligações e compromissos com seus leads"
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            Nova tarefa
          </Button>
        }
      />
      <div className="mx-auto max-w-4xl p-6">
        <Tabs
          value={view}
          onChange={setView}
          className="mb-4"
          items={[
            { value: 'minhas', label: 'Minhas', count: counts.minhas },
            { value: 'todas', label: 'Toda a equipe', count: counts.todas },
            { value: 'concluidas', label: 'Concluídas', count: counts.concluidas },
          ]}
        />
        {groups.length === 0 && (
          <Card>
            <EmptyState icon={<CheckSquare className="h-5 w-5" />} title="Tudo em dia! 🎉" text="Nenhuma tarefa pendente por aqui." />
          </Card>
        )}
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className={cn('mb-2 text-[13px] font-semibold', g.tone)}>
                {g.label} <span className="font-normal text-ink-3">· {g.items.length}</span>
              </h2>
              <Card className="divide-y divide-line">
                {g.items.map((t) => {
                  const c = contacts.find((x) => x.id === t.contactId);
                  const u = users.find((x) => x.id === t.assigneeId);
                  const Icon = TYPE[t.type].icon;
                  const late = !t.done && new Date(t.dueAt) < new Date();
                  return (
                    <div key={t.id} className="group flex items-center gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Concluir tarefa"
                        checked={t.done}
                        onChange={() => {
                          update('tasks', t.id, { done: !t.done });
                          if (!t.done) toast('Tarefa concluída');
                        }}
                        className="h-4 w-4 accent-[var(--brand)]"
                      />
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink-2">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={cn('text-[13.5px] font-medium', t.done && 'text-ink-3 line-through')}>{t.title}</div>
                        <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                          <span className={cn(late && 'font-medium text-critical')}>{dateTimeBR(t.dueAt)}</span>
                          {c && <span>· {c.name}</span>}
                        </div>
                      </div>
                      <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>
                      {u && <Avatar name={u.name} color={u.color} size={24} />}
                      <div className="flex opacity-0 transition group-hover:opacity-100">
                        <button aria-label="Editar" className="rounded p-1.5 text-ink-3 hover:bg-canvas" onClick={() => setEditing(t)}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button aria-label="Excluir" className="rounded p-1.5 text-ink-3 hover:bg-canvas hover:text-critical" onClick={() => (remove('tasks', t.id), toast('Tarefa excluída'))}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      </div>
      <TaskModal open={creating || Boolean(editing)} task={editing ?? undefined} onClose={() => (setCreating(false), setEditing(null))} />
    </div>
  );
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function TaskModal({ open, onClose, task, contactId }: { open: boolean; onClose: () => void; task?: Task; contactId?: string }) {
  const contacts = useStore((s) => s.contacts);
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.sessionUserId);
  const { add, update, toast } = useStore.getState();
  const blank = (): Task => {
    const due = new Date(Date.now() + 86_400_000);
    due.setHours(10, 0, 0, 0);
    return { id: uid('tsk-'), title: '', type: 'whatsapp', priority: 'media', dueAt: due.toISOString(), done: false, contactId, assigneeId: me ?? undefined, createdAt: nowIso() };
  };
  const [form, setForm] = useState<Task>(task ?? blank());
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? (task?.id ?? 'new') : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) setForm(task ?? blank());
  }

  const save = () => {
    if (task) update('tasks', task.id, form);
    else add('tasks', form);
    toast(task ? 'Tarefa atualizada' : 'Tarefa criada');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? 'Editar tarefa' : 'Nova tarefa'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!form.title.trim()} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Título" className="sm:col-span-2">
          <Input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Ligar para confirmar a avaliação" />
        </Field>
        <Field label="Tipo">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TaskType })}>
            {Object.entries(TYPE).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prioridade">
          <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
            {Object.entries(PRIORITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data e hora">
          <Input type="datetime-local" value={toLocalInput(form.dueAt)} onChange={(e) => e.target.value && setForm({ ...form, dueAt: new Date(e.target.value).toISOString() })} />
        </Field>
        <Field label="Responsável">
          <Select value={form.assigneeId ?? ''} onChange={(e) => setForm({ ...form, assigneeId: e.target.value || undefined })}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contato" className="sm:col-span-2">
          <Select value={form.contactId ?? ''} onChange={(e) => setForm({ ...form, contactId: e.target.value || undefined })}>
            <option value="">Sem contato vinculado</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Descrição" className="sm:col-span-2">
          <Textarea rows={3} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
