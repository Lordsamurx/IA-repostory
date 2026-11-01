import { useMemo, useState } from 'react';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Button, Card, Confirm, EmptyState, Field, Input, Modal, PageHeader, SearchInput, Select, Switch, Textarea } from '../components/ui';
import { cn, money, normalize, uid } from '../lib/utils';
import type { Product } from '../types';

export default function Produtos() {
  const products = useStore((s) => s.products);
  const deals = useStore((s) => s.deals);
  const { update, remove, toast } = useStore.getState();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const categories = [...new Set(products.map((p) => p.category))].sort();
  const list = useMemo(
    () =>
      products.filter(
        (p) => (!category || p.category === category) && (!query || normalize(`${p.name} ${p.sku} ${p.description}`).includes(normalize(query))),
      ),
    [products, query, category],
  );

  const soldCount = (id: string) => deals.filter((d) => d.status === 'ganho' && d.productIds.includes(id)).length;

  return (
    <div>
      <PageHeader
        title="Produtos e serviços"
        subtitle="Catálogo usado nos negócios do funil e pelos agentes de IA para informar preços"
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            Novo produto
          </Button>
        }
      />
      <div className="p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <SearchInput placeholder="Buscar produto ou SKU" value={query} onChange={(e) => setQuery(e.target.value)} className="w-72" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-52" aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        {list.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Package className="h-5 w-5" />}
              title="Nenhum produto"
              text="Cadastre produtos e serviços para usar nas propostas e para a IA responder preços."
              action={<Button onClick={() => setCreating(true)}>Cadastrar produto</Button>}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {list.map((p) => (
              <Card key={p.id} className={cn('flex flex-col p-4', !p.active && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-md bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink-2">{p.category}</span>
                  <Switch checked={p.active} label="Ativo" onChange={(v) => update('products', p.id, { active: v })} />
                </div>
                <h3 className="mt-3 font-semibold">{p.name}</h3>
                <p className="mt-1 line-clamp-2 flex-1 text-[13px] text-ink-3">{p.description}</p>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-xl font-semibold tabular-nums">{money(p.price)}</div>
                    <div className="text-[11.5px] text-ink-3">
                      SKU {p.sku} · {soldCount(p.id)} venda(s)
                    </div>
                  </div>
                  <div className="flex">
                    <button aria-label="Editar" className="rounded-md p-1.5 text-ink-3 hover:bg-canvas" onClick={() => setEditing(p)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button aria-label="Excluir" className="rounded-md p-1.5 text-ink-3 hover:bg-canvas hover:text-critical" onClick={() => setDeleting(p)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <ProductModal open={creating || Boolean(editing)} product={editing ?? undefined} categories={categories} onClose={() => (setCreating(false), setEditing(null))} />
      <Confirm
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Excluir produto?"
        text={`"${deleting?.name}" será removido do catálogo.`}
        onConfirm={() => {
          if (deleting) remove('products', deleting.id);
          toast('Produto excluído');
        }}
      />
    </div>
  );
}

function ProductModal({ open, onClose, product, categories }: { open: boolean; onClose: () => void; product?: Product; categories: string[] }) {
  const { add, update, toast } = useStore.getState();
  const blank = (): Product => ({ id: uid('prd-'), name: '', sku: '', category: categories[0] ?? 'Geral', price: 0, description: '', active: true });
  const [form, setForm] = useState<Product>(product ?? blank());
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? (product?.id ?? 'new') : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) setForm(product ?? blank());
  }

  const save = () => {
    if (product) update('products', product.id, form);
    else add('products', form);
    toast(product ? 'Produto atualizado' : 'Produto criado');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? 'Editar produto' : 'Novo produto'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!form.name.trim()} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2">
          <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Preço (R$)">
          <Input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
        </Field>
        <Field label="SKU / código">
          <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </Field>
        <Field label="Categoria" className="sm:col-span-2" hint="Digite uma nova ou escolha uma existente">
          <Input list="categorias" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <datalist id="categorias">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Descrição" className="sm:col-span-2" hint="A IA usa essa descrição para explicar o produto ao cliente.">
          <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
