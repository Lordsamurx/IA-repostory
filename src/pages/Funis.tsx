import { useMemo, useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, CalendarClock, Plus, Settings2, ThumbsDown, ThumbsUp, Trash2, Trophy } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Avatar, Button, Confirm, Field, Input, Modal, PageHeader, SearchInput, Select, TagChip } from '../components/ui';
import DealModal from '../components/DealModal';
import { cn, dayDiff, money, moneyShort, normalize, rampFor, uid } from '../lib/utils';
import type { Deal, Pipeline } from '../types';

export default function Funis() {
  const pipelines = useStore((s) => s.pipelines);
  const deals = useStore((s) => s.deals);
  const contacts = useStore((s) => s.contacts);
  const users = useStore((s) => s.users);
  const tags = useStore((s) => s.tags);
  const tasks = useStore((s) => s.tasks);
  const { moveDeal, setDealStatus, toast } = useStore.getState();

  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState('');
  const [view, setView] = useState<'aberto' | 'ganho' | 'perdido'>('aberto');
  const [editing, setEditing] = useState<Deal | undefined>();
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [editPipeline, setEditPipeline] = useState(false);

  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const filtered = useMemo(
    () =>
      deals.filter((d) => {
        if (d.pipelineId !== pipeline?.id) return false;
        if (owner && d.ownerId !== owner) return false;
        if (query) {
          const c = contactById.get(d.contactId);
          if (!normalize(`${d.title} ${c?.name} ${c?.phone}`).includes(normalize(query))) return false;
        }
        return true;
      }),
    [deals, pipeline?.id, owner, query, contactById],
  );
  const open = filtered.filter((d) => d.status === 'aberto');
  const won = filtered.filter((d) => d.status === 'ganho');
  const lost = filtered.filter((d) => d.status === 'perdido');
  const forecast = pipeline ? open.reduce((a, d) => a + d.value * ((pipeline.stages.find((s) => s.id === d.stageId)?.probability ?? 0) / 100), 0) : 0;

  if (!pipeline) return null;

  const onDrop = (e: DragEvent, target: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setOverStage(null);
    setDragId(null);
    if (!id) return;
    if (target === 'ganho') {
      setDealStatus(id, 'ganho');
      toast('🎉 Negócio ganho!');
    } else if (target === 'perdido') {
      setDealStatus(id, 'perdido', 'Não informado');
      toast('Negócio marcado como perdido', 'info');
    } else {
      const d = deals.find((x) => x.id === id);
      if (d && (d.stageId !== target || d.status !== 'aberto')) moveDeal(id, target);
    }
  };

  const dropProps = (target: string) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      if (overStage !== target) setOverStage(target);
    },
    onDragLeave: () => setOverStage((s) => (s === target ? null : s)),
    onDrop: (e: DragEvent) => onDrop(e, target),
  });

  const card = (d: Deal) => {
    const c = contactById.get(d.contactId);
    const u = users.find((x) => x.id === d.ownerId);
    const days = -dayDiff(d.updatedAt);
    const pending = tasks.filter((t) => !t.done && (t.dealId === d.id || t.contactId === d.contactId)).length;
    return (
      <div
        key={d.id}
        draggable={d.status === 'aberto'}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', d.id);
          e.dataTransfer.effectAllowed = 'move';
          setDragId(d.id);
        }}
        onDragEnd={() => (setDragId(null), setOverStage(null))}
        onClick={() => setEditing(d)}
        className={cn(
          'cursor-pointer rounded-xl border border-line bg-surface p-3 shadow-card transition hover:border-brand-300 hover:shadow-pop',
          dragId === d.id && 'opacity-40',
        )}
      >
        <div className="flex items-start gap-2">
          <Avatar name={c?.name ?? '?'} color={c?.color} size={28} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{c?.name ?? 'Contato removido'}</div>
            <div className="truncate text-[12px] text-ink-3">{d.title}</div>
          </div>
        </div>
        {c && c.tagIds.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags
              .filter((t) => c.tagIds.includes(t.id))
              .slice(0, 2)
              .map((t) => (
                <TagChip key={t.id} name={t.name} color={t.color} />
              ))}
          </div>
        )}
        <div className="mt-2.5 flex items-center gap-2 text-[12px]">
          <span className="font-semibold text-ink tabular-nums">{money(d.value)}</span>
          {pending > 0 && (
            <span className="flex items-center gap-0.5 text-ink-3" title={`${pending} tarefa(s) pendente(s)`}>
              <CalendarClock className="h-3.5 w-3.5" /> {pending}
            </span>
          )}
          <span className={cn('ml-auto', days > 7 ? 'text-serious' : 'text-ink-3')} title="Dias sem movimentação">
            {days}d
          </span>
          {u && <Avatar name={u.name} color={u.color} size={20} />}
        </div>
        {d.status === 'perdido' && d.lostReason && <div className="mt-1.5 text-[11.5px] text-critical">Motivo: {d.lostReason}</div>}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Funis de vendas"
        subtitle="Arraste os cards entre as etapas. Solte em Ganho ou Perdido para encerrar o negócio."
        actions={
          <>
            <Button variant="secondary" icon={<Settings2 className="h-4 w-4" />} onClick={() => setEditPipeline(true)}>
              Editar funis
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreatingIn(pipeline.stages[0]!.id)}>
              Novo negócio
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-6 py-3">
        <Select value={pipeline.id} onChange={(e) => setPipelineId(e.target.value)} className="w-56" aria-label="Funil">
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <SearchInput placeholder="Buscar negócio ou contato" value={query} onChange={(e) => setQuery(e.target.value)} className="w-64" />
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-48" aria-label="Responsável">
          <option value="">Todos os responsáveis</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-canvas p-1 text-[13px]">
          {(
            [
              ['aberto', `Em aberto · ${open.length}`],
              ['ganho', `Ganhos · ${won.length}`],
              ['perdido', `Perdidos · ${lost.length}`],
            ] as const
          ).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} className={cn('rounded-md px-3 py-1', view === v ? 'bg-surface font-medium shadow-card' : 'text-ink-3')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6 border-b border-line bg-surface px-6 py-2.5 text-[13px]">
        <span className="text-ink-3">
          Em aberto: <b className="text-ink tabular-nums">{money(open.reduce((a, d) => a + d.value, 0))}</b>
        </span>
        <span className="text-ink-3">
          Previsão ponderada: <b className="text-ink tabular-nums">{money(forecast)}</b>
        </span>
        <span className="text-ink-3">
          Ganhos: <b className="text-good tabular-nums">{money(won.reduce((a, d) => a + d.value, 0))}</b>
        </span>
      </div>

      {view === 'aberto' ? (
        <div className="relative flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full gap-3 p-4">
            {pipeline.stages.map((s) => {
              const items = open.filter((d) => d.stageId === s.id);
              return (
                <div
                  key={s.id}
                  {...dropProps(s.id)}
                  className={cn(
                    'flex h-full w-[288px] shrink-0 flex-col rounded-2xl bg-[#e9edf1] transition',
                    overStage === s.id && 'bg-brand-100 ring-2 ring-brand-400',
                  )}
                >
                  <div className="px-3 pt-3 pb-2">
                    <div className="h-1 rounded-full" style={{ background: s.color }} />
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold">{s.name}</span>
                      <span className="rounded-full bg-white px-1.5 text-[11px] font-medium text-ink-2">{items.length}</span>
                      <span className="ml-auto text-[12px] font-medium text-ink-2 tabular-nums">{moneyShort(items.reduce((a, d) => a + d.value, 0))}</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                    {items.map(card)}
                    <button
                      onClick={() => setCreatingIn(s.id)}
                      className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-[#c5ced6] py-2 text-[12.5px] text-ink-3 hover:border-brand-400 hover:text-brand-600"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {dragId && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center gap-4">
              <div
                {...dropProps('perdido')}
                className={cn(
                  'pointer-events-auto flex h-16 w-60 items-center justify-center gap-2 rounded-2xl border-2 border-dashed font-medium shadow-pop transition',
                  overStage === 'perdido' ? 'border-critical bg-[#fdecec] text-critical' : 'border-[#f2b8b8] bg-white text-[#a52828]',
                )}
              >
                <ThumbsDown className="h-5 w-5" /> Perdido
              </div>
              <div
                {...dropProps('ganho')}
                className={cn(
                  'pointer-events-auto flex h-16 w-60 items-center justify-center gap-2 rounded-2xl border-2 border-dashed font-medium shadow-pop transition',
                  overStage === 'ganho' ? 'border-good bg-[#e8f6e8] text-[#0b6b0b]' : 'border-[#b6e2b6] bg-white text-[#0b6b0b]',
                )}
              >
                <ThumbsUp className="h-5 w-5" /> Ganho
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          {(view === 'ganho' ? won : lost).length === 0 ? (
            <div className="py-16 text-center text-sm text-ink-3">
              <Trophy className="mx-auto mb-2 h-6 w-6" /> Nenhum negócio {view === 'ganho' ? 'ganho' : 'perdido'} neste funil.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{(view === 'ganho' ? won : lost).map(card)}</div>
          )}
        </div>
      )}

      <DealModal open={Boolean(editing)} deal={editing} onClose={() => setEditing(undefined)} />
      <DealModal open={Boolean(creatingIn)} pipelineId={pipeline.id} stageId={creatingIn ?? undefined} onClose={() => setCreatingIn(null)} />
      <PipelineEditor open={editPipeline} onClose={() => setEditPipeline(false)} current={pipeline} onSelect={setPipelineId} />
    </div>
  );
}

function PipelineEditor({ open, onClose, current, onSelect }: { open: boolean; onClose: () => void; current: Pipeline; onSelect: (id: string) => void }) {
  const pipelines = useStore((s) => s.pipelines);
  const deals = useStore((s) => s.deals);
  const { update, add, remove, toast } = useStore.getState();
  const [draft, setDraft] = useState<Pipeline>(current);
  const [confirmDel, setConfirmDel] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);

  if (open && !lastOpen) {
    setDraft(current);
    setLastOpen(true);
  } else if (!open && lastOpen) setLastOpen(false);

  const isNew = !pipelines.some((p) => p.id === draft.id);
  const stages = draft.stages;
  const setStages = (s: Pipeline['stages']) => setDraft({ ...draft, stages: s.map((x, i) => ({ ...x, color: rampFor(i, s.length) })) });
  const move = (i: number, dir: -1 | 1) => {
    const copy = [...stages];
    const [it] = copy.splice(i, 1);
    copy.splice(i + dir, 0, it!);
    setStages(copy);
  };

  const save = () => {
    const removed = pipelines.find((p) => p.id === draft.id)?.stages.filter((s) => !draft.stages.some((x) => x.id === s.id)) ?? [];
    // negócios de etapas removidas voltam para a primeira etapa
    for (const s of removed) for (const d of deals.filter((x) => x.stageId === s.id)) update('deals', d.id, { stageId: draft.stages[0]!.id });
    if (isNew) add('pipelines', draft);
    else update('pipelines', draft.id, draft);
    onSelect(draft.id);
    toast('Funil salvo');
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Editar funis"
        size="lg"
        footer={
          <div className="flex w-full items-center gap-2">
            {!isNew && pipelines.length > 1 && (
              <Button variant="ghost" className="text-critical" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDel(true)}>
                Excluir funil
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={!draft.name.trim() || stages.length < 2}>
              Salvar funil
            </Button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {pipelines.map((p) => (
            <button
              key={p.id}
              onClick={() => setDraft(p)}
              className={cn('rounded-lg border px-3 py-1.5 text-[13px]', draft.id === p.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line')}
            >
              {p.name}
            </button>
          ))}
          <button
            onClick={() =>
              setDraft({
                id: uid('pip-'),
                name: 'Novo funil',
                stages: ['Entrada', 'Em andamento', 'Concluído'].map((n, i) => ({ id: uid('stg-'), name: n, color: rampFor(i, 3), probability: [20, 60, 100][i]! })),
              })
            }
            className="rounded-lg border border-dashed border-line px-3 py-1.5 text-[13px] text-ink-3 hover:border-brand-400"
          >
            + Novo funil
          </button>
        </div>
        <Field label="Nome do funil">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <div className="mt-4 mb-1.5 grid grid-cols-[1fr_120px_96px] gap-2 text-[12px] font-medium text-ink-3">
          <span>Etapa</span>
          <span>Probabilidade %</span>
          <span />
        </div>
        <div className="space-y-2">
          {stages.map((s, i) => (
            <div key={s.id} className="grid grid-cols-[1fr_120px_96px] items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="h-7 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <Input value={s.name} onChange={(e) => setStages(stages.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} />
              </div>
              <Input type="number" min={0} max={100} value={s.probability} onChange={(e) => setStages(stages.map((x) => (x.id === s.id ? { ...x, probability: Number(e.target.value) } : x)))} />
              <div className="flex">
                <button aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1.5 text-ink-3 hover:bg-canvas disabled:opacity-30">
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button aria-label="Descer" disabled={i === stages.length - 1} onClick={() => move(i, 1)} className="rounded p-1.5 text-ink-3 hover:bg-canvas disabled:opacity-30">
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button aria-label="Remover" disabled={stages.length <= 2} onClick={() => setStages(stages.filter((x) => x.id !== s.id))} className="rounded p-1.5 text-ink-3 hover:bg-canvas hover:text-critical disabled:opacity-30">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          icon={<Plus className="h-4 w-4" />}
          disabled={stages.length >= 8}
          onClick={() => setStages([...stages, { id: uid('stg-'), name: 'Nova etapa', color: '', probability: 50 }])}
        >
          Adicionar etapa
        </Button>
      </Modal>
      <Confirm
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Excluir funil?"
        text={`Os negócios do funil "${draft.name}" também serão excluídos.`}
        onConfirm={() => {
          for (const d of deals.filter((x) => x.pipelineId === draft.id)) remove('deals', d.id);
          remove('pipelines', draft.id);
          onSelect(pipelines.find((p) => p.id !== draft.id)!.id);
          onClose();
          toast('Funil excluído');
        }}
      />
    </>
  );
}
