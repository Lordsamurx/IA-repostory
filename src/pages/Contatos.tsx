import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, MessageSquare, Pencil, Plus, Trash2, Upload, Users } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Avatar, Button, Card, Confirm, Drawer, EmptyState, Field, Input, PageHeader, SearchInput, Select, TagChip, Textarea } from '../components/ui';
import { cn, dateBR, downloadCsv, formatPhone, normalize, onlyDigits, parseCsv, pickColor, uid, nowIso } from '../lib/utils';
import { LEAD_SOURCES, type Contact, type LeadSource } from '../types';
import CustomFieldInput from '../components/CustomFieldInput';

const PAGE = 25;

export default function Contatos() {
  const contacts = useStore((s) => s.contacts);
  const tags = useStore((s) => s.tags);
  const users = useStore((s) => s.users);
  const deals = useStore((s) => s.deals);
  const { removeContact, startConversation, toast, add } = useStore.getState();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [source, setSource] = useState('');
  const [owner, setOwner] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Contact | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = normalize(query);
    return contacts
      .filter((c) => {
        if (tag && !c.tagIds.includes(tag)) return false;
        if (source && c.source !== source) return false;
        if (owner && c.ownerId !== owner) return false;
        if (q && !normalize(`${c.name} ${c.email ?? ''} ${c.company ?? ''} ${c.city ?? ''}`).includes(q) && !(onlyDigits(q) && c.phone.includes(onlyDigits(q)))) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [contacts, query, tag, source, owner]);

  const pageItems = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const allOnPage = pageItems.length > 0 && pageItems.every((c) => selected.has(c.id));

  const exportCsv = () => {
    const rows = filtered.map((c) => [
      c.name,
      c.phone,
      c.email ?? '',
      c.company ?? '',
      c.city ?? '',
      c.source,
      tags.filter((t) => c.tagIds.includes(t.id)).map((t) => t.name).join(', '),
      dateBR(c.createdAt),
    ]);
    downloadCsv('contatos.csv', [['Nome', 'Telefone', 'E-mail', 'Empresa', 'Cidade', 'Origem', 'Etiquetas', 'Criado em'], ...rows]);
  };

  const importCsv = async (file?: File) => {
    if (!file) return;
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return toast('Arquivo vazio ou sem cabeçalho', 'error');
    const header = rows[0]!.map((h) => normalize(h));
    const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
    const iName = col('nome', 'name');
    const iPhone = col('telefone', 'celular', 'whatsapp', 'phone', 'fone');
    if (iName < 0 || iPhone < 0) return toast('O CSV precisa das colunas "Nome" e "Telefone"', 'error');
    const iEmail = col('email', 'e-mail');
    const iCompany = col('empresa', 'company');
    const iCity = col('cidade', 'city');
    const existing = new Set(contacts.map((c) => c.phone));
    let n = 0;
    for (const r of rows.slice(1)) {
      const digits = onlyDigits(r[iPhone] ?? '');
      if (!r[iName] || digits.length < 10) continue;
      const phone = digits.startsWith('55') ? digits : `55${digits}`;
      if (existing.has(phone)) continue;
      existing.add(phone);
      add('contacts', {
        id: uid('ctt-'),
        name: r[iName]!,
        phone,
        email: iEmail >= 0 ? r[iEmail] || undefined : undefined,
        company: iCompany >= 0 ? r[iCompany] || undefined : undefined,
        city: iCity >= 0 ? r[iCity] || undefined : undefined,
        source: 'WhatsApp',
        tagIds: [],
        createdAt: nowIso(),
        color: pickColor(r[iName]!),
      });
      n++;
    }
    toast(`${n} contato(s) importado(s)`);
  };

  return (
    <div>
      <PageHeader
        title="Contatos"
        subtitle={`${contacts.length} contatos na base`}
        actions={
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => (importCsv(e.target.files?.[0]), (e.target.value = ''))} />
            <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
              Importar CSV
            </Button>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>
              Exportar
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              Novo contato
            </Button>
          </>
        }
      />

      <div className="p-6">
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <SearchInput placeholder="Buscar por nome, telefone, e-mail…" value={query} onChange={(e) => (setQuery(e.target.value), setPage(0))} className="w-72" />
            <Select value={tag} onChange={(e) => (setTag(e.target.value), setPage(0))} className="w-44" aria-label="Etiqueta">
              <option value="">Todas as etiquetas</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Select value={source} onChange={(e) => (setSource(e.target.value), setPage(0))} className="w-40" aria-label="Origem">
              <option value="">Todas as origens</option>
              {LEAD_SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
            <Select value={owner} onChange={(e) => (setOwner(e.target.value), setPage(0))} className="w-44" aria-label="Responsável">
              <option value="">Todos os responsáveis</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
            {selected.size > 0 && (
              <Button variant="danger" size="sm" className="ml-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting([...selected])}>
                Excluir {selected.size}
              </Button>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={<Users className="h-5 w-5" />} title="Nenhum contato encontrado" text="Ajuste os filtros ou cadastre um novo contato." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-line bg-canvas/60 text-[12px] text-ink-3">
                  <tr>
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Selecionar página"
                        checked={allOnPage}
                        onChange={() => {
                          const s = new Set(selected);
                          pageItems.forEach((c) => (allOnPage ? s.delete(c.id) : s.add(c.id)));
                          setSelected(s);
                        }}
                        className="accent-[var(--brand)]"
                      />
                    </th>
                    <th className="px-3 py-2.5 font-medium">Contato</th>
                    <th className="px-3 py-2.5 font-medium">Telefone</th>
                    <th className="px-3 py-2.5 font-medium">Etiquetas</th>
                    <th className="px-3 py-2.5 font-medium">Origem</th>
                    <th className="px-3 py-2.5 font-medium">Responsável</th>
                    <th className="px-3 py-2.5 font-medium">Negócios</th>
                    <th className="px-3 py-2.5 font-medium">Criado em</th>
                    <th className="w-28 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => {
                    const u = users.find((x) => x.id === c.ownerId);
                    const nDeals = deals.filter((d) => d.contactId === c.id).length;
                    return (
                      <tr key={c.id} className={cn('border-b border-line/70 last:border-0 hover:bg-canvas/60', selected.has(c.id) && 'bg-brand-50/60')}>
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${c.name}`}
                            checked={selected.has(c.id)}
                            onChange={() => {
                              const s = new Set(selected);
                              if (s.has(c.id)) s.delete(c.id);
                              else s.add(c.id);
                              setSelected(s);
                            }}
                            className="accent-[var(--brand)]"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <button className="flex items-center gap-2.5 text-left" onClick={() => setEditing(c)}>
                            <Avatar name={c.name} color={c.color} size={30} />
                            <span>
                              <span className="block font-medium hover:text-brand-700">{c.name}</span>
                              <span className="block text-[12px] text-ink-3">{c.email ?? c.company ?? c.city ?? ''}</span>
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-ink-2">{formatPhone(c.phone)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {tags
                              .filter((t) => c.tagIds.includes(t.id))
                              .map((t) => (
                                <TagChip key={t.id} name={t.name} color={t.color} />
                              ))}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-ink-2">{c.source}</td>
                        <td className="px-3 py-2.5">
                          {u ? (
                            <span className="flex items-center gap-1.5 whitespace-nowrap">
                              <Avatar name={u.name} color={u.color} size={20} /> {u.name.split(' ')[0]}
                            </span>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-ink-2 tabular-nums">{nDeals}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-ink-3">{dateBR(c.createdAt)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-0.5">
                            <button title="Abrir conversa" className="rounded-md p-1.5 text-ink-3 hover:bg-brand-50 hover:text-brand-700" onClick={() => navigate(`/inbox/${startConversation(c.id)}`)}>
                              <MessageSquare className="h-4 w-4" />
                            </button>
                            <button title="Editar" className="rounded-md p-1.5 text-ink-3 hover:bg-canvas hover:text-ink" onClick={() => setEditing(c)}>
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button title="Excluir" className="rounded-md p-1.5 text-ink-3 hover:bg-[#fdecec] hover:text-critical" onClick={() => setDeleting([c.id])}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px] text-ink-3">
            <span>
              {filtered.length} resultado(s) · página {page + 1} de {pages}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <Button size="sm" variant="secondary" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        </Card>
        <p className="mt-3 text-[12px] text-ink-3">Dica: o CSV de importação precisa das colunas “Nome” e “Telefone” (opcionais: E-mail, Empresa, Cidade). Números repetidos são ignorados.</p>
      </div>

      <ContactDrawer open={creating || Boolean(editing)} contact={editing ?? undefined} onClose={() => (setCreating(false), setEditing(null))} />
      <Confirm
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Excluir ${deleting?.length ?? 0} contato(s)?`}
        text="As conversas, mensagens e negócios desses contatos também serão excluídos."
        onConfirm={() => {
          deleting?.forEach((id) => removeContact(id));
          setSelected(new Set());
          toast('Contato(s) excluído(s)');
        }}
      />
    </div>
  );
}

function ContactDrawer({ open, onClose, contact }: { open: boolean; onClose: () => void; contact?: Contact }) {
  const tags = useStore((s) => s.tags);
  const users = useStore((s) => s.users);
  const contacts = useStore((s) => s.contacts);
  const customFields = useStore((s) => s.customFields);
  const { update, createContact, toast } = useStore.getState();
  const empty = { name: '', phone: '', email: '', company: '', city: '', source: 'WhatsApp' as LeadSource, tagIds: [] as string[], ownerId: '', notes: '', customFields: {} as Record<string, string> };
  const [form, setForm] = useState(empty);
  const [lastKey, setLastKey] = useState<string | null>(null);

  const key = open ? (contact?.id ?? 'new') : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (open)
      setForm(
        contact
          ? { name: contact.name, phone: contact.phone, email: contact.email ?? '', company: contact.company ?? '', city: contact.city ?? '', source: contact.source, tagIds: contact.tagIds, ownerId: contact.ownerId ?? '', notes: contact.notes ?? '', customFields: contact.customFields ?? {} }
          : empty,
      );
  }

  const digits = onlyDigits(form.phone);
  const phone = digits.startsWith('55') ? digits : `55${digits}`;
  const duplicate = contacts.find((c) => c.phone === phone && c.id !== contact?.id);
  const valid = form.name.trim() && digits.length >= 10 && !duplicate;

  const save = () => {
    const data = {
      name: form.name.trim(),
      phone,
      email: form.email || undefined,
      company: form.company || undefined,
      city: form.city || undefined,
      source: form.source,
      tagIds: form.tagIds,
      ownerId: form.ownerId || undefined,
      notes: form.notes || undefined,
      customFields: form.customFields,
    };
    if (contact) update('contacts', contact.id, data);
    else createContact(data);
    toast(contact ? 'Contato atualizado' : 'Contato criado');
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={contact ? 'Editar contato' : 'Novo contato'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome *">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="WhatsApp (com DDD) *" hint={duplicate ? <span className="text-critical">Já existe um contato com esse número: {duplicate.name}</span> : undefined}>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(31) 99999-0000" />
        </Field>
        <Field label="E-mail">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Empresa">
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </Field>
          <Field label="Cidade">
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Origem">
            <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as LeadSource })}>
              {LEAD_SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável">
            <Select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
              <option value="">Sem responsável</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Etiquetas">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => {
              const on = form.tagIds.includes(t.id);
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setForm({ ...form, tagIds: on ? form.tagIds.filter((x) => x !== t.id) : [...form.tagIds, t.id] })}
                  className={cn('rounded-full border px-2.5 py-0.5 text-[12px]', on ? 'border-transparent text-white' : 'border-line text-ink-2')}
                  style={on ? { background: t.color } : undefined}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </Field>
        {customFields.map((f) => (
          <Field key={f.id} label={f.name}>
            <CustomFieldInput field={f} value={form.customFields[f.id]} onChange={(v) => setForm((x) => ({ ...x, customFields: { ...x.customFields, [f.id]: v } }))} />
          </Field>
        ))}
        <Field label="Anotações">
          <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
    </Drawer>
  );
}
