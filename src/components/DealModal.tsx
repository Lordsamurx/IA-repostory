import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Button, Confirm, Field, Input, Modal, Select } from './ui';
import { cn, money, nowIso, uid } from '../lib/utils';
import type { Deal } from '../types';

export default function DealModal({
  open,
  onClose,
  deal,
  pipelineId,
  stageId,
}: {
  open: boolean;
  onClose: () => void;
  deal?: Deal;
  pipelineId?: string;
  stageId?: string;
}) {
  const contacts = useStore((s) => s.contacts);
  const pipelines = useStore((s) => s.pipelines);
  const products = useStore((s) => s.products);
  const users = useStore((s) => s.users);
  const sessionUserId = useStore((s) => s.sessionUserId);
  const { add, update, remove, toast, startConversation } = useStore.getState();
  const navigate = useNavigate();

  const blank = (): Deal => {
    const p = pipelines.find((x) => x.id === pipelineId) ?? pipelines[0]!;
    return {
      id: uid('dea-'),
      pipelineId: p.id,
      stageId: stageId ?? p.stages[0]!.id,
      contactId: contacts[0]?.id ?? '',
      title: '',
      value: 0,
      ownerId: sessionUserId ?? undefined,
      productIds: [],
      status: 'aberto',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  };

  const [form, setForm] = useState<Deal>(deal ?? blank());
  const [confirmDel, setConfirmDel] = useState(false);
  const [lostReason, setLostReason] = useState(deal?.lostReason ?? '');

  useEffect(() => {
    if (open) {
      setForm(deal ?? blank());
      setLostReason(deal?.lostReason ?? '');
    }
  }, [open, deal?.id]);

  const pipeline = pipelines.find((p) => p.id === form.pipelineId) ?? pipelines[0];
  const set = (patch: Partial<Deal>) => setForm((f) => ({ ...f, ...patch }));

  const toggleProduct = (id: string) => {
    const ids = form.productIds.includes(id) ? form.productIds.filter((x) => x !== id) : [...form.productIds, id];
    const total = products.filter((p) => ids.includes(p.id)).reduce((a, p) => a + p.price, 0);
    set({ productIds: ids, value: total || form.value });
  };

  const save = (patch: Partial<Deal> = {}) => {
    const contact = contacts.find((c) => c.id === form.contactId);
    const final = { ...form, ...patch, title: form.title.trim() || `Oportunidade — ${contact?.name ?? ''}`, updatedAt: nowIso() };
    if (deal) update('deals', deal.id, final);
    else add('deals', final);
    toast(deal ? 'Negócio atualizado' : 'Negócio criado');
    onClose();
  };

  const openChat = () => {
    const id = startConversation(form.contactId);
    navigate(`/inbox/${id}`);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={deal ? 'Editar negócio' : 'Novo negócio'}
        size="lg"
        footer={
          <div className="flex w-full items-center gap-2">
            {deal && (
              <Button variant="ghost" className="text-critical" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDel(true)}>
                Excluir
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={!form.contactId} onClick={() => save()}>
              Salvar
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Título" className="sm:col-span-2">
            <Input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Implante dentário — 2 unidades" />
          </Field>
          <Field label="Contato">
            <div className="flex gap-1.5">
              <Select value={form.contactId} onChange={(e) => set({ contactId: e.target.value })}>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {deal && (
                <Button variant="secondary" title="Abrir conversa" onClick={openChat} className="px-2.5">
                  <MessageSquare className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Field>
          <Field label="Valor (R$)">
            <Input type="number" min={0} step="0.01" value={form.value} onChange={(e) => set({ value: Number(e.target.value) })} />
          </Field>
          <Field label="Funil">
            <Select value={form.pipelineId} onChange={(e) => set({ pipelineId: e.target.value, stageId: pipelines.find((p) => p.id === e.target.value)!.stages[0]!.id })}>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Etapa">
            <Select value={form.stageId} onChange={(e) => set({ stageId: e.target.value })}>
              {pipeline?.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável">
            <Select value={form.ownerId ?? ''} onChange={(e) => set({ ownerId: e.target.value || undefined })}>
              <option value="">Sem responsável</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Previsão de fechamento">
            <Input type="date" value={form.expectedClose?.slice(0, 10) ?? ''} onChange={(e) => set({ expectedClose: e.target.value ? new Date(e.target.value + 'T12:00').toISOString() : undefined })} />
          </Field>
          <Field label="Produtos" className="sm:col-span-2" hint="Selecionar produtos soma os preços no valor do negócio.">
            <div className="flex flex-wrap gap-1.5">
              {products
                .filter((p) => p.active)
                .map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => toggleProduct(p.id)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-[12px]',
                      form.productIds.includes(p.id) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-2 hover:border-brand-300',
                    )}
                  >
                    {p.name} · {money(p.price)}
                  </button>
                ))}
              {products.length === 0 && <span className="text-[12px] text-ink-3">Cadastre produtos no menu Produtos.</span>}
            </div>
          </Field>
        </div>

        {deal && (
          <div className="mt-5 rounded-xl border border-line bg-canvas p-3">
            <div className="mb-2 text-[13px] font-medium">Resultado do negócio</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={form.status === 'ganho' ? 'primary' : 'secondary'} icon={<ThumbsUp className="h-4 w-4" />} onClick={() => save({ status: 'ganho', lostReason: undefined })}>
                Marcar como ganho
              </Button>
              <Input className="h-8 max-w-52 text-[13px]" placeholder="Motivo da perda" value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
              <Button size="sm" variant={form.status === 'perdido' ? 'danger' : 'secondary'} icon={<ThumbsDown className="h-4 w-4" />} onClick={() => save({ status: 'perdido', lostReason: lostReason || 'Não informado' })}>
                Marcar como perdido
              </Button>
              {form.status !== 'aberto' && (
                <Button size="sm" variant="ghost" onClick={() => save({ status: 'aberto', lostReason: undefined })}>
                  Reabrir
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
      <Confirm
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Excluir negócio?"
        text="Essa ação não pode ser desfeita."
        onConfirm={() => {
          if (deal) remove('deals', deal.id);
          onClose();
          toast('Negócio excluído');
        }}
      />
    </>
  );
}
