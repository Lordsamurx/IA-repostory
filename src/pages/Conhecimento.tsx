import { useMemo, useRef, useState } from 'react';
import { BookOpen, FileText, HelpCircle, Link2, Pencil, Plus, Search, Trash2, Type, Upload } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Badge, Button, Card, Confirm, EmptyState, Field, Input, Modal, PageHeader, SearchInput, Tabs, Textarea } from '../components/ui';
import { normalize, nowIso, relative, uid } from '../lib/utils';
import { searchKnowledge } from '../lib/ai';
import type { KnowledgeItem, KnowledgeType } from '../types';

const TYPES: Record<KnowledgeType, { label: string; icon: typeof HelpCircle }> = {
  faq: { label: 'Pergunta frequente', icon: HelpCircle },
  texto: { label: 'Texto livre', icon: Type },
  url: { label: 'Link / site', icon: Link2 },
  documento: { label: 'Documento', icon: FileText },
};

export default function Conhecimento() {
  const items = useStore((s) => s.knowledge);
  const agents = useStore((s) => s.agents);
  const { remove, toast } = useStore.getState();
  const [type, setType] = useState<'todos' | KnowledgeType>('todos');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [creating, setCreating] = useState<KnowledgeType | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeItem | null>(null);
  const [test, setTest] = useState('');

  const list = useMemo(
    () => items.filter((k) => (type === 'todos' || k.type === type) && (!query || normalize(`${k.title} ${k.content}`).includes(normalize(query)))),
    [items, type, query],
  );
  const testResult = test.trim() ? searchKnowledge(test, items) : undefined;

  return (
    <div>
      <PageHeader
        title="Base de conhecimento"
        subtitle="O que os agentes de IA sabem sobre o seu negócio. Nada de preço inventado: a IA responde só com o que estiver aqui."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating('faq')}>
            Adicionar conteúdo
          </Button>
        }
      />
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Tabs
              value={type}
              onChange={setType}
              items={[
                { value: 'todos', label: 'Todos', count: items.length },
                ...(Object.keys(TYPES) as KnowledgeType[]).map((t) => ({ value: t, label: TYPES[t].label, count: items.filter((k) => k.type === t).length })),
              ]}
            />
            <SearchInput placeholder="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} className="ml-auto w-56" />
          </div>
          {list.length === 0 ? (
            <Card>
              <EmptyState icon={<BookOpen className="h-5 w-5" />} title="Nada por aqui ainda" text="Comece pelas perguntas que seus clientes mais fazem no WhatsApp." action={<Button onClick={() => setCreating('faq')}>Adicionar pergunta</Button>} />
            </Card>
          ) : (
            <div className="space-y-2.5">
              {list.map((k) => {
                const Icon = TYPES[k.type].icon;
                const usedBy = agents.filter((a) => a.knowledgeIds.includes(k.id));
                return (
                  <Card key={k.id} className="group flex gap-3 p-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{k.title}</h3>
                        <Badge>{TYPES[k.type].label}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-3 text-[13px] whitespace-pre-wrap text-ink-2">{k.content}</p>
                      <div className="mt-2 text-[11.5px] text-ink-3">
                        Atualizado {relative(k.updatedAt)} · {usedBy.length ? `usado por ${usedBy.map((a) => a.name).join(', ')}` : 'não vinculado a nenhum agente'}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-start opacity-0 transition group-hover:opacity-100">
                      <button aria-label="Editar" className="rounded-md p-1.5 text-ink-3 hover:bg-canvas" onClick={() => setEditing(k)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button aria-label="Excluir" className="rounded-md p-1.5 text-ink-3 hover:bg-canvas hover:text-critical" onClick={() => setDeleting(k)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold">
              <Search className="h-4 w-4 text-brand-600" /> Testar a busca
            </h3>
            <p className="mt-1 text-[12.5px] text-ink-3">Escreva como um cliente escreveria e veja qual conteúdo a IA usaria para responder.</p>
            <Textarea rows={2} className="mt-3" placeholder="Ex.: aceita cartão? parcela?" value={test} onChange={(e) => setTest(e.target.value)} />
            {testResult !== undefined && (
              <div className="mt-3 rounded-lg border border-line bg-canvas p-3 text-[13px]">
                {testResult ? (
                  <>
                    <div className="mb-1 text-[11px] font-semibold text-brand-700 uppercase">Encontrado: {testResult.title}</div>
                    {testResult.content}
                  </>
                ) : (
                  <span className="text-ink-3">Nenhum conteúdo correspondente. A IA faria a próxima pergunta de qualificação ou transferiria para um humano.</span>
                )}
              </div>
            )}
          </Card>
          <Card className="p-4">
            <h3 className="text-[14px] font-semibold">Adicionar rápido</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(Object.keys(TYPES) as KnowledgeType[]).map((t) => {
                const Icon = TYPES[t].icon;
                return (
                  <button key={t} onClick={() => setCreating(t)} className="flex flex-col items-start gap-1.5 rounded-lg border border-line p-3 text-left text-[12.5px] hover:border-brand-400 hover:bg-brand-50">
                    <Icon className="h-4 w-4 text-brand-600" />
                    {TYPES[t].label}
                  </button>
                );
              })}
            </div>
          </Card>
        </aside>
      </div>

      <KnowledgeModal open={Boolean(creating) || Boolean(editing)} item={editing ?? undefined} type={creating ?? 'faq'} onClose={() => (setCreating(null), setEditing(null))} />
      <Confirm open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Excluir conteúdo?" text={`"${deleting?.title}" deixará de ser usado pelos agentes.`} onConfirm={() => (deleting && remove('knowledge', deleting.id), toast('Conteúdo excluído'))} />
    </div>
  );
}

function KnowledgeModal({ open, onClose, item, type }: { open: boolean; onClose: () => void; item?: KnowledgeItem; type: KnowledgeType }) {
  const { add, update, toast, agents } = useStore.getState();
  const blank = (): KnowledgeItem => ({ id: uid('kb-'), type, title: '', content: '', updatedAt: nowIso() });
  const [form, setForm] = useState<KnowledgeItem>(item ?? blank());
  const [lastKey, setLastKey] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const key = open ? (item?.id ?? `new-${type}`) : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) setForm(item ?? blank());
  }

  const save = () => {
    const data = { ...form, updatedAt: nowIso() };
    if (item) update('knowledge', item.id, data);
    else {
      add('knowledge', data);
      // novo conteúdo é liberado para todos os agentes ativos
      for (const a of agents.filter((x) => x.active)) update('agents', a.id, { knowledgeIds: [...a.knowledgeIds, data.id] });
    }
    toast('Base de conhecimento atualizada');
    onClose();
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    if (!/\.(txt|md|csv|json)$/i.test(f.name)) return toast('Envie arquivos de texto (.txt, .md, .csv). Para PDF, cole o conteúdo.', 'error');
    const text = await f.text();
    setForm((x) => ({ ...x, title: x.title || f.name, content: text.slice(0, 20000) }));
  };

  const labels = {
    faq: ['Pergunta', 'Resposta'],
    texto: ['Título', 'Conteúdo'],
    url: ['Nome do link', 'URL'],
    documento: ['Nome do documento', 'Conteúdo do documento'],
  }[form.type];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Editar conteúdo' : `Novo: ${TYPES[form.type].label}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!form.title.trim() || !form.content.trim()} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={labels[0]}>
          <Input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        {form.type === 'url' ? (
          <Field label={labels[1]} hint="A IA envia este link quando o cliente pedir mais informações.">
            <Input type="url" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="https://" />
          </Field>
        ) : (
          <Field label={labels[1]}>
            <Textarea rows={form.type === 'faq' ? 4 : 10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </Field>
        )}
        {form.type === 'documento' && (
          <>
            <input ref={fileRef} type="file" hidden accept=".txt,.md,.csv,.json" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="secondary" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
              Carregar de arquivo de texto
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
