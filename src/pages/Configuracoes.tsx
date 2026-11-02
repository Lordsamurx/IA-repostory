import { useEffect, useRef, useState } from 'react';
import { ThumbsUp, Building2, CheckCircle2, Circle, Database, ListPlus, Download, KeyRound, Monitor, Moon, Palette, Pencil, Plus, Server, Sun, Tag as TagIcon, Trash2, Upload, Users, Wrench, Zap } from 'lucide-react';
import { useMe, useStore } from '../store/useStore';
import { Avatar, Badge, Button, Card, Confirm, Field, Input, Modal, PageHeader, Select, Switch, TagChip, Textarea } from '../components/ui';
import { cn, fieldVar, pickColor, SWATCHES, uid } from '../lib/utils';
import { isSupabaseMode } from '../lib/supabase';
import { hashPassword } from '../lib/password';
import { checkServerAI } from '../lib/ai';
import { serverHealth, type ServerHealth } from '../lib/api';
import { COLLECTIONS, type DataState } from '../data/seed';
import type { CustomFieldType, Role, ThemeMode, User, Weekday } from '../types';

type Section = 'empresa' | 'nps' | 'equipe' | 'departamentos' | 'etiquetas' | 'campos' | 'respostas' | 'aparencia' | 'integracoes' | 'instalacao' | 'dados';

const SECTIONS: { id: Section; label: string; icon: typeof Building2; admin?: boolean }[] = [
  { id: 'empresa', label: 'Empresa e horários', icon: Building2 },
  { id: 'nps', label: 'Pesquisa NPS', icon: ThumbsUp },
  { id: 'equipe', label: 'Equipe', icon: Users },
  { id: 'departamentos', label: 'Departamentos', icon: Users },
  { id: 'etiquetas', label: 'Etiquetas', icon: TagIcon },
  { id: 'campos', label: 'Campos personalizados', icon: ListPlus },
  { id: 'respostas', label: 'Respostas rápidas', icon: Zap },
  { id: 'aparencia', label: 'Aparência (white label)', icon: Palette },
  { id: 'integracoes', label: 'Integrações e IA', icon: KeyRound },
  { id: 'instalacao', label: 'Status da instalação', icon: Wrench },
  { id: 'dados', label: 'Backup e dados', icon: Database, admin: true },
];

export default function Configuracoes() {
  const me = useMe();
  const [section, setSection] = useState<Section>('empresa');
  const isAdmin = me?.role === 'admin';

  return (
    <div>
      <PageHeader title="Configurações" subtitle="Ajuste o CRM ao jeito do seu negócio" />
      <div className="grid gap-6 p-6 lg:grid-cols-[230px_1fr]">
        <nav className="space-y-0.5">
          {SECTIONS.filter((s) => !s.admin || isAdmin).map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px]',
                section === s.id ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-2 hover:bg-surface',
              )}
            >
              <s.icon className="h-4 w-4" /> {s.label}
            </button>
          ))}
        </nav>
        <div className="max-w-3xl">
          {!isAdmin && section !== 'instalacao' && (
            <div className="mb-4 rounded-lg bg-[color-mix(in_oklab,var(--warning)_16%,var(--surface))] px-4 py-2.5 text-[13px] text-[color-mix(in_oklab,var(--warning)_78%,var(--ink))]">
              Somente administradores podem alterar estas configurações.
            </div>
          )}
          <fieldset disabled={!isAdmin && section !== 'instalacao'} className="min-w-0">
            {section === 'empresa' && <Empresa />}
            {section === 'nps' && <NpsSettings />}
            {section === 'equipe' && <Equipe />}
            {section === 'departamentos' && <Departamentos />}
            {section === 'etiquetas' && <Etiquetas />}
            {section === 'campos' && <Campos />}
            {section === 'respostas' && <Respostas />}
            {section === 'aparencia' && <Aparencia />}
            {section === 'integracoes' && <Integracoes />}
            {section === 'instalacao' && <Instalacao />}
            {section === 'dados' && <Dados />}
          </fieldset>
        </div>
      </div>
    </div>
  );
}

function Empresa() {
  const settings = useStore((s) => s.settings);
  const { setSettings, toast } = useStore.getState();
  const [form, setForm] = useState(settings);
  return (
    <Card className="space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da empresa">
          <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
        </Field>
        <Field label="Tipo de negócio">
          <Input value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })} />
        </Field>
        <Field label="Fuso horário">
          <Select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
            {['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Rio_Branco', 'America/Noronha', 'Europe/Lisbon'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Abre às">
            <Input type="time" value={form.businessHours.start} onChange={(e) => setForm({ ...form, businessHours: { ...form.businessHours, start: e.target.value } })} />
          </Field>
          <Field label="Fecha às">
            <Input type="time" value={form.businessHours.end} onChange={(e) => setForm({ ...form, businessHours: { ...form.businessHours, end: e.target.value } })} />
          </Field>
        </div>
      </div>
      <Field label="Dias de atendimento">
        <div className="flex flex-wrap gap-1.5">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => {
            const on = form.businessHours.days.includes(i as Weekday);
            return (
              <button
                type="button"
                key={d}
                onClick={() =>
                  setForm({ ...form, businessHours: { ...form.businessHours, days: on ? form.businessHours.days.filter((x) => x !== i) : ([...form.businessHours.days, i as Weekday].sort() as Weekday[]) } })
                }
                className={cn('h-8 w-11 rounded-lg border text-[12.5px]', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-line text-ink-2')}
              >
                {d}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Mensagem fora do horário" hint="Enviada pelos agentes de IA quando configurados para responder fora do expediente.">
        <Textarea rows={2} value={form.outOfHoursMessage} onChange={(e) => setForm({ ...form, outOfHoursMessage: e.target.value })} />
      </Field>
      <label className="flex items-center justify-between rounded-lg border border-line p-3">
        <span>
          <span className="block text-[13.5px] font-medium">Distribuição automática</span>
          <span className="text-[12.5px] text-ink-3">Quem responde primeiro um lead da fila vira o responsável pela conversa.</span>
        </span>
        <Switch checked={form.autoAssign} onChange={(v) => setForm({ ...form, autoAssign: v })} />
      </label>
      <div className="flex justify-end">
        <Button onClick={() => (setSettings(form), toast('Configurações salvas'))}>Salvar</Button>
      </div>
    </Card>
  );
}

function Equipe() {
  const users = useStore((s) => s.users);
  const departments = useStore((s) => s.departments);
  const me = useMe();
  const { add, update, remove, toast } = useStore.getState();
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [form, setForm] = useState<User & { password?: string }>({} as User);
  const [busy, setBusy] = useState(false);

  const openNew = () => {
    const u: User = { id: uid('usr-'), name: '', email: '', role: 'atendente', presence: 'offline', departmentIds: departments.slice(0, 1).map((d) => d.id), color: SWATCHES[users.length % SWATCHES.length]!, password: '' };
    setForm(u);
    setEditing(u);
  };
  const isNew = Boolean(editing && !users.some((u) => u.id === editing.id));

  const save = async () => {
    if (isNew) {
      if (users.some((u) => u.email.toLowerCase() === form.email.toLowerCase())) return toast('Já existe um usuário com esse e-mail', 'error');
      // No modo Supabase o login é criado pelo admin no painel do Supabase (cadastro aberto
      // desligado); aqui a pessoa entra na equipe e é vinculada ao login pelo e-mail.
      const id = form.id;
      setBusy(true);
      // no modo local a senha entra na conta só como hash; no Supabase ela fica no Auth
      const passwordHash = !isSupabaseMode && form.password ? await hashPassword(form.password) : undefined;
      const { password: _typed, ...rest } = form;
      setBusy(false);
      add('users', { ...rest, email: rest.email.trim().toLowerCase(), id, color: form.color || pickColor(form.name), passwordHash, password: undefined });
      toast(isSupabaseMode ? 'Usuário adicionado à equipe. Ele já pode entrar com o login criado no Supabase.' : 'Usuário criado');
    } else {
      const { password, ...rest } = form;
      const passwordHash = !isSupabaseMode && password ? await hashPassword(password) : undefined;
      // `password: undefined` remove a versão antiga em texto puro, se existir
      update('users', form.id, { ...rest, password: undefined, ...(passwordHash ? { passwordHash } : {}) });
      toast('Usuário atualizado');
    }
    setEditing(null);
  };

  const ROLES: Record<Role, string> = { admin: 'Administrador', supervisor: 'Supervisor', atendente: 'Atendente' };

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div>
          <h2 className="font-semibold">Equipe</h2>
          <p className="text-[12.5px] text-ink-3">{users.length} usuário(s)</p>
        </div>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openNew}>
          Adicionar usuário
        </Button>
      </div>
      <div className="divide-y divide-line">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-5 py-3">
            <Avatar name={u.name} color={u.color} size={36} presence={u.presence} />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium">
                {u.name} {u.id === me?.id && <span className="text-ink-3">(você)</span>}
              </div>
              <div className="text-[12px] text-ink-3">
                {u.email} · {departments.filter((d) => u.departmentIds.includes(d.id)).map((d) => d.name).join(', ') || 'sem departamento'}
              </div>
            </div>
            <Badge tone={u.role === 'admin' ? 'brand' : 'neutral'}>{ROLES[u.role]}</Badge>
            <button aria-label="Editar" className="rounded p-1.5 text-ink-3 hover:bg-canvas" onClick={() => (setForm({ ...u, password: '' }), setEditing(u))}>
              <Pencil className="h-4 w-4" />
            </button>
            <button aria-label="Excluir" disabled={u.id === me?.id} className="rounded p-1.5 text-ink-3 hover:bg-canvas hover:text-critical disabled:opacity-30" onClick={() => setDeleting(u)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={isNew ? 'Novo usuário' : 'Editar usuário'}
        footer={
          <Button disabled={busy || !form.name?.trim() || !form.email?.includes('@') || (isNew && !isSupabaseMode && (form.password?.length ?? 0) < 6)} onClick={save}>
            Salvar
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome">
            <Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="E-mail de login">
            <Input type="email" disabled={!isNew} value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Perfil de acesso">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {Object.entries(ROLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          {!isSupabaseMode && (
            <Field label={isNew ? 'Senha inicial' : 'Nova senha (opcional)'} hint="Mínimo de 6 caracteres">
              <Input type="password" autoComplete="new-password" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
          )}
          <Field label="Departamentos" className="sm:col-span-2">
            <div className="flex flex-wrap gap-3">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-1.5 text-[13px]">
                  <input
                    type="checkbox"
                    className="accent-[var(--brand)]"
                    checked={form.departmentIds?.includes(d.id) ?? false}
                    onChange={(e) => setForm({ ...form, departmentIds: e.target.checked ? [...form.departmentIds, d.id] : form.departmentIds.filter((x) => x !== d.id) })}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </Field>
        </div>
        {isNew && isSupabaseMode && (
          <div className="mt-4 rounded-lg bg-canvas p-3 text-[12.5px] text-ink-2">
            <b>Antes de salvar, crie o login da pessoa no Supabase</b> (o cadastro aberto fica desligado por segurança):
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>Supabase → Authentication → Users → Add user → Create new user</li>
              <li>Informe o mesmo e-mail daqui, uma senha inicial e marque “Auto Confirm User”</li>
              <li>Salve aqui. No primeiro acesso, a pessoa entra com esse e-mail e senha</li>
            </ol>
          </div>
        )}
      </Modal>
      <Confirm
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Remover usuário?"
        text={`${deleting?.name} perde o acesso à equipe. Conversas atribuídas a ele voltam para a fila.`}
        onConfirm={() => {
          if (!deleting) return;
          for (const c of useStore.getState().conversations.filter((x) => x.assigneeId === deleting.id && x.status !== 'finalizado'))
            update('conversations', c.id, { assigneeId: undefined, status: 'aguardando' });
          remove('users', deleting.id);
          toast('Usuário removido');
        }}
      />
    </Card>
  );
}

function SimpleList({
  title,
  subtitle,
  items,
  onAdd,
  onRename,
  onColor,
  onRemove,
  render,
}: {
  title: string;
  subtitle: string;
  items: { id: string; name: string; color: string }[];
  onAdd: (name: string, color: string) => void;
  onRename: (id: string, name: string) => void;
  onColor: (id: string, color: string) => void;
  onRemove: (id: string) => void;
  render?: (it: { id: string; name: string; color: string }) => React.ReactNode;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[1]!);
  return (
    <Card>
      <div className="border-b border-line px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-[12.5px] text-ink-3">{subtitle}</p>
      </div>
      <div className="divide-y divide-line">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 px-5 py-2.5">
            <input type="color" value={it.color} onChange={(e) => onColor(it.id, e.target.value)} className="h-7 w-8 cursor-pointer rounded border border-line" aria-label="Cor" />
            <input
              defaultValue={it.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== it.name && onRename(it.id, e.target.value.trim())}
              className="flex-1 rounded-md border border-transparent px-2 py-1 text-[13.5px] outline-none hover:border-line focus:border-brand-500"
            />
            {render?.(it)}
            <button aria-label="Remover" className="rounded p-1.5 text-ink-3 hover:text-critical" onClick={() => onRemove(it.id)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-5 py-3">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-10 cursor-pointer rounded border border-line" aria-label="Cor" />
        <Input placeholder="Nome…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && (onAdd(name.trim(), color), setName(''))} />
        <Button disabled={!name.trim()} onClick={() => (onAdd(name.trim(), color), setName(''))}>
          Adicionar
        </Button>
      </div>
    </Card>
  );
}

function Etiquetas() {
  const tags = useStore((s) => s.tags);
  const contacts = useStore((s) => s.contacts);
  const { add, update, remove } = useStore.getState();
  return (
    <SimpleList
      title="Etiquetas"
      subtitle="Classifique leads por interesse, temperatura ou etapa. Aparecem na lista de conversas e nos filtros."
      items={tags}
      onAdd={(name, color) => add('tags', { id: uid('tag-'), name, color })}
      onRename={(id, name) => update('tags', id, { name })}
      onColor={(id, color) => update('tags', id, { color })}
      onRemove={(id) => {
        for (const c of contacts.filter((x) => x.tagIds.includes(id))) update('contacts', c.id, { tagIds: c.tagIds.filter((t) => t !== id) });
        remove('tags', id);
      }}
      render={(t) => (
        <span className="flex items-center gap-2">
          <TagChip name={t.name} color={t.color} />
          <span className="w-16 text-right text-[12px] text-ink-3">{contacts.filter((c) => c.tagIds.includes(t.id)).length} contatos</span>
        </span>
      )}
    />
  );
}

function Departamentos() {
  const departments = useStore((s) => s.departments);
  const users = useStore((s) => s.users);
  const { add, update, remove, toast } = useStore.getState();
  return (
    <SimpleList
      title="Departamentos (filas)"
      subtitle="Separe o atendimento por área. Conexões e transferências usam os departamentos."
      items={departments}
      onAdd={(name, color) => add('departments', { id: uid('dep-'), name, color })}
      onRename={(id, name) => update('departments', id, { name })}
      onColor={(id, color) => update('departments', id, { color })}
      onRemove={(id) => {
        if (departments.length <= 1) return toast('Mantenha pelo menos um departamento', 'error');
        remove('departments', id);
      }}
      render={(d) => <span className="text-[12px] text-ink-3">{users.filter((u) => u.departmentIds.includes(d.id)).length} atendente(s)</span>}
    />
  );
}

function Respostas() {
  const items = useStore((s) => s.quickReplies);
  const { add, update, remove, toast } = useStore.getState();
  const [shortcut, setShortcut] = useState('');
  const [content, setContent] = useState('');
  return (
    <Card>
      <div className="border-b border-line px-5 py-3">
        <h2 className="font-semibold">Respostas rápidas</h2>
        <p className="text-[12.5px] text-ink-3">No chat, digite “/” seguido do atalho. Variáveis: {'{{nome}}'} e {'{{empresa}}'}.</p>
      </div>
      <div className="divide-y divide-line">
        {items.map((q) => (
          <div key={q.id} className="flex items-start gap-3 px-5 py-3">
            <span className="mt-1.5 font-mono text-[13px] font-semibold text-brand-700">/{q.shortcut}</span>
            <Textarea rows={2} defaultValue={q.content} onBlur={(e) => e.target.value !== q.content && update('quickReplies', q.id, { content: e.target.value })} className="text-[13px]" />
            <button aria-label="Remover" className="mt-1 rounded p-1.5 text-ink-3 hover:text-critical" onClick={() => remove('quickReplies', q.id)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid gap-2 border-t border-line px-5 py-3 sm:grid-cols-[140px_1fr_auto]">
        <Input placeholder="atalho" value={shortcut} onChange={(e) => setShortcut(e.target.value.replace(/[^\w-]/g, '').toLowerCase())} />
        <Input placeholder="Texto da resposta…" value={content} onChange={(e) => setContent(e.target.value)} />
        <Button
          disabled={!shortcut || !content.trim()}
          onClick={() => {
            if (items.some((q) => q.shortcut === shortcut)) return toast('Esse atalho já existe', 'error');
            add('quickReplies', { id: uid('qr-'), shortcut, content: content.trim() });
            setShortcut('');
            setContent('');
          }}
        >
          Adicionar
        </Button>
      </div>
    </Card>
  );
}

function Aparencia() {
  const settings = useStore((s) => s.settings);
  const { setSettings, toast } = useStore.getState();
  const currentTheme: ThemeMode = settings.theme ?? 'light';
  const themes: { id: ThemeMode; label: string; desc: string; icon: typeof Sun }[] = [
    { id: 'light', label: 'Claro', desc: 'Visual clássico e iluminado', icon: Sun },
    { id: 'dark', label: 'Escuro elegante', desc: 'Tons suaves de grafite para menor fadiga visual', icon: Moon },
    { id: 'system', label: 'Sistema', desc: 'Acompanha a preferência do dispositivo', icon: Monitor },
  ];
  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="font-semibold">Deixe com a sua cara</h2>
        <p className="text-[12.5px] text-ink-3">O projeto é open source (MIT): você pode colocar sua marca e oferecer o CRM aos seus clientes. As mudanças aparecem na hora.</p>
      </div>
      <Field label="Tema da interface">
        <div className="grid gap-3 sm:grid-cols-3">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSettings({ theme: t.id })}
              className={cn(
                'flex flex-col items-start rounded-xl border p-3.5 text-left transition',
                currentTheme === t.id ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-line hover:border-brand-300',
              )}
            >
              <t.icon className={cn('h-4 w-4', currentTheme === t.id ? 'text-brand-600' : 'text-ink-3')} />
              <div className="mt-2 text-[13px] font-semibold">{t.label}</div>
              <div className="mt-0.5 text-[11.5px] text-ink-3">{t.desc}</div>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Nome exibido no menu e no login">
        <Input defaultValue={settings.logoText} onBlur={(e) => e.target.value.trim() && setSettings({ logoText: e.target.value.trim() })} />
      </Field>
      <Field label="Cor principal">
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((c) => (
            <button key={c} aria-label={`Cor ${c}`} onClick={() => setSettings({ brandColor: c })} className={cn('h-9 w-9 rounded-full ring-offset-2', settings.brandColor === c && 'ring-2 ring-ink')} style={{ background: c }} />
          ))}
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input type="color" value={settings.brandColor} onChange={(e) => setSettings({ brandColor: e.target.value })} className="h-9 w-11 cursor-pointer rounded border border-line" />
            Personalizada
          </label>
        </div>
      </Field>
      <div className="rounded-xl border border-line p-4">
        <div className="mb-3 text-[12px] font-medium text-ink-3 uppercase">Pré-visualização</div>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Botão principal</Button>
          <Button variant="soft">Secundário</Button>
          <Badge tone="brand">Etiqueta</Badge>
          <span className="rounded-xl rounded-tr-sm bg-bubble-out px-3 py-2 text-[13px] shadow-sm">Mensagem enviada ✓✓</span>
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => (setSettings({ brandColor: '#00a389', logoText: 'LeadFlow', theme: 'light' }), toast('Aparência restaurada'))}>
          Restaurar padrão
        </Button>
      </div>
    </Card>
  );
}

function useServerAI() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    void checkServerAI().then(setOk);
  }, []);
  return ok;
}

function Integracoes() {
  const settings = useStore((s) => s.settings);
  const { setSettings } = useStore.getState();
  const serverAI = useServerAI();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Provedor de IA dos agentes</h2>
            <p className="text-[12.5px] text-ink-3">A chave fica só no servidor (variável AI_API_KEY), nunca no navegador.</p>
          </div>
          {serverAI === null ? null : serverAI ? <Badge tone="good">● Conectado</Badge> : <Badge tone="warning">Motor local</Badge>}
        </div>
        <Field label="Provedor preferido" className="mt-4 max-w-xs">
          <Select value={settings.aiProvider} onChange={(e) => setSettings({ aiProvider: e.target.value as 'anthropic' | 'openai' })}>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT / Codex)</option>
          </Select>
        </Field>
        {!serverAI && (
          <pre className="mt-4 overflow-x-auto rounded-lg bg-[#0e1f2b] p-3 text-[12px] text-[#c9d6df]">
            {`# no servidor, edite o arquivo .env da instalação:\nAI_PROVIDER=${settings.aiProvider}\nAI_API_KEY=sua-chave-aqui\n\n# e reinicie:\ndocker compose up -d`}
          </pre>
        )}
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Webhooks e API</h2>
        <p className="text-[12.5px] text-ink-3">Endpoints do servidor da instalação.</p>
        <dl className="mt-3 space-y-2 text-[13px]">
          {[
            ['Saúde do servidor', `${origin}/api/health`],
            ['Webhook da API oficial (Meta)', `${origin}/api/whatsapp/meta`],
            ['Resposta de IA (uso interno)', `${origin}/api/ai/reply`],
            ['Webhook do WhatsApp (Evolution, configurado sozinho ao conectar)', `${origin}/api/whatsapp/webhook`],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-canvas px-3 py-2">
              <dt className="text-ink-2">{k}</dt>
              <dd className="font-mono text-[12px]">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

function Instalacao() {
  const connections = useStore((s) => s.connections);
  const users = useStore((s) => s.users);
  const conversations = useStore((s) => s.conversations);
  const serverAI = useServerAI();
  const [health, setHealth] = useState<ServerHealth | null | undefined>(undefined);
  useEffect(() => {
    void serverHealth().then(setHealth);
  }, []);
  const server = health === undefined ? null : Boolean(health);
  const pending = (v: boolean | undefined) => (health === undefined ? null : Boolean(v));
  const https = typeof window !== 'undefined' && window.location.protocol === 'https:';

  const checks: { label: string; ok: boolean | null; hint: string }[] = [
    { label: 'Domínio apontado e com certificado (HTTPS)', ok: https, hint: 'Passo 4 do material — registro A apontando para o IP da VPS.' },
    { label: 'Banco de dados Supabase conectado', ok: isSupabaseMode, hint: 'Passo 3 — sem Supabase o CRM roda em modo local (dados só neste navegador).' },
    { label: 'Servidor da API no ar', ok: server, hint: 'Container "api" do docker-compose.' },
    { label: 'Chave de IA configurada', ok: serverAI, hint: 'AI_API_KEY no .env do servidor. Sem ela, os agentes usam o motor local.' },
    {
      label: 'Automações rodando 24 h no servidor',
      ok: pending(health?.automation),
      hint: 'SUPABASE_SERVICE_ROLE_KEY no .env do servidor. Sem ela, chatbot, IA, follow-ups e disparos só rodam com um administrador logado.',
    },
    { label: 'Gateway de WhatsApp (Evolution API)', ok: pending(health?.whatsapp), hint: 'EVOLUTION_API_URL, EVOLUTION_API_KEY e WHATSAPP_WEBHOOK_TOKEN no .env do servidor.' },
    { label: 'Login de administrador funcionando', ok: users.some((u) => u.role === 'admin'), hint: 'Criado pelo instalador.' },
    { label: 'WhatsApp conectado', ok: connections.some((c) => c.status === 'conectado'), hint: 'Passo 7 — menu Conexões.' },
    { label: 'Mensagens chegando no Inbox', ok: conversations.length > 0, hint: 'Envie uma mensagem de outro número e responda pelo CRM.' },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div>
          <h2 className="font-semibold">Checklist da instalação</h2>
          <p className="text-[12.5px] text-ink-3">Baseado no checklist final do material de instalação.</p>
        </div>
        <Badge tone={isSupabaseMode ? 'good' : 'info'}>
          <Server className="h-3 w-3" /> {isSupabaseMode ? 'Modo produção (Supabase)' : 'Modo local'}
        </Badge>
      </div>
      <ul className="divide-y divide-line">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-3 px-5 py-3">
            {c.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-good" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-ink-3" />}
            <div>
              <div className="text-[13.5px] font-medium">
                {c.label} <span className="text-[12px] font-normal text-ink-3">{c.ok ? '· ok' : c.ok === null ? '· verificando…' : '· pendente'}</span>
              </div>
              <div className="text-[12.5px] text-ink-3">{c.hint}</div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Dados() {
  const { replaceAll, resetDemo, toast } = useStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const exportJson = () => {
    const s = useStore.getState();
    const data: Partial<DataState> = { settings: s.settings };
    for (const c of COLLECTIONS) (data as Record<string, unknown>)[c] = c === 'users' ? s.users.map(({ password: _p, passwordHash: _h, ...u }) => u) : s[c];
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup-crm-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (f?: File) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as Partial<DataState>;
      if (!data.settings || !Array.isArray(data.contacts)) throw new Error('formato inválido');
      const me = useStore.getState().users.find((u) => u.id === useStore.getState().sessionUserId);
      const users = data.users ?? [];
      // mantém o usuário logado para não perder o acesso
      if (me && !users.some((u) => u.id === me.id)) users.push(me);
      replaceAll({ ...data, users });
      toast('Backup restaurado');
    } catch (e) {
      toast(`Arquivo inválido: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-semibold">Backup</h2>
          <p className="text-[12.5px] text-ink-3">Exporte todos os dados do CRM em JSON (sem senhas) ou restaure um backup.</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => (importJson(e.target.files?.[0]), (e.target.value = ''))} />
          <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
            Restaurar
          </Button>
          <Button icon={<Download className="h-4 w-4" />} onClick={exportJson}>
            Exportar backup
          </Button>
        </div>
      </Card>
      {!isSupabaseMode && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="font-semibold">Dados de demonstração</h2>
            <p className="text-[12.5px] text-ink-3">Recarrega a clínica de exemplo, apagando o que está salvo neste navegador.</p>
          </div>
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            Restaurar demonstração
          </Button>
        </Card>
      )}
      <Confirm open={confirmReset} onClose={() => setConfirmReset(false)} title="Restaurar demonstração?" text="Todos os dados atuais deste navegador serão substituídos." confirmLabel="Restaurar" onConfirm={() => (resetDemo(), toast('Demonstração restaurada'))} />
    </div>
  );
}

const FIELD_TYPES: Record<CustomFieldType, string> = {
  texto: 'Texto simples',
  texto_longo: 'Texto com várias linhas',
  email: 'E-mail',
  numero: 'Número',
  data: 'Data',
  hora: 'Hora',
  lista: 'Lista de opções',
};

function Campos() {
  const fields = useStore((s) => s.customFields);
  const contacts = useStore((s) => s.contacts);
  const { add, update, remove, toast } = useStore.getState();
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomFieldType>('texto');
  const [options, setOptions] = useState('');
  return (
    <Card>
      <div className="border-b border-line px-5 py-3">
        <h2 className="font-semibold">Campos personalizados</h2>
        <p className="text-[12.5px] text-ink-3">Informações extras do contato (convênio, CPF, data de nascimento…). Aparecem no painel do chat e no cadastro, e viram variáveis nas mensagens: escreva {'{{nome_do_campo}}'} numa resposta rápida, disparo ou follow-up.</p>
      </div>
      <div className="divide-y divide-line">
        {fields.length === 0 && <p className="px-5 py-6 text-center text-[13px] text-ink-3">Nenhum campo criado.</p>}
        {fields.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
            <input
              defaultValue={f.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== f.name && update('customFields', f.id, { name: e.target.value.trim() })}
              className="min-w-40 flex-1 rounded-md border border-transparent px-2 py-1 text-[13.5px] outline-none hover:border-line focus:border-brand-500"
            />
            <Badge>{FIELD_TYPES[f.type]}</Badge>
            <code className="rounded bg-canvas px-1.5 py-0.5 text-[11.5px] text-brand-700" title="Use em mensagens, respostas rápidas, disparos e follow-ups">{`{{${fieldVar(f.name)}}}`}</code>
            {f.type === 'lista' && (
              <input
                defaultValue={f.options.join(', ')}
                onBlur={(e) => update('customFields', f.id, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
                className="min-w-48 flex-1 rounded-md border border-line px-2 py-1 text-[12.5px] outline-none focus:border-brand-500"
                aria-label="Opções"
              />
            )}
            <span className="text-[12px] text-ink-3">{contacts.filter((c) => c.customFields?.[f.id]).length} preenchidos</span>
            <button aria-label="Remover" className="rounded p-1.5 text-ink-3 hover:text-critical" onClick={() => (remove('customFields', f.id), toast('Campo removido'))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid gap-2 border-t border-line px-5 py-3 sm:grid-cols-[1fr_160px_auto]">
        <Input placeholder="Nome do campo" value={name} onChange={(e) => setName(e.target.value)} />
        <Select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
          {Object.entries(FIELD_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Button
          disabled={!name.trim() || (type === 'lista' && !options.trim())}
          onClick={() => {
            add('customFields', { id: uid('cf-'), name: name.trim(), type, options: type === 'lista' ? options.split(',').map((x) => x.trim()).filter(Boolean) : [] });
            setName('');
            setOptions('');
            toast('Campo criado');
          }}
        >
          Adicionar
        </Button>
        {type === 'lista' && <Input className="sm:col-span-3" placeholder="Opções separadas por vírgula (ex.: Particular, Convênio A, Convênio B)" value={options} onChange={(e) => setOptions(e.target.value)} />}
      </div>
    </Card>
  );
}

function NpsSettings() {
  const nps = useStore((s) => s.settings.nps);
  const { setSettings, toast } = useStore.getState();
  const [form, setForm] = useState(nps);
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Pesquisa de satisfação (NPS)</h2>
        <p className="text-[12.5px] text-ink-3">
          O cliente responde de 0 a 10. Notas 9–10 são promotores, 7–8 neutros e 0–6 detratores. NPS = % promotores − % detratores. Os resultados ficam em Análises → NPS.
        </p>
      </div>
      <label className="flex items-center justify-between rounded-lg border border-line p-3">
        <span className="text-[13.5px] font-medium">Pesquisa ativada</span>
        <Switch checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
      </label>
      <label className="flex items-center justify-between rounded-lg border border-line p-3">
        <span>
          <span className="block text-[13.5px] font-medium">Enviar automaticamente ao finalizar o atendimento</span>
          <span className="text-[12.5px] text-ink-3">Desligado: só quando alguém clicar em “Solicitar NPS” no chat.</span>
        </span>
        <Switch checked={form.autoOnFinish} onChange={(v) => setForm({ ...form, autoOnFinish: v })} />
      </label>
      <Field label="Pergunta" hint="Variáveis: {{nome}}, {{empresa}} e campos personalizados">
        <Textarea rows={2} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} />
      </Field>
      <Field label="Agradecimento (enviado após a nota)">
        <Textarea rows={2} value={form.thanks} onChange={(e) => setForm({ ...form, thanks: e.target.value })} />
      </Field>
      <div className="flex justify-end">
        <Button onClick={() => (setSettings({ nps: form }), toast('Pesquisa NPS salva'))}>Salvar</Button>
      </div>
    </Card>
  );
}
