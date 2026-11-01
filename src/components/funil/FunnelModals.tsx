import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { Button, Field, Modal, Select, Switch } from '../ui';
import { cn, nowIso, uid } from '../../lib/utils';
import { LEAD_SOURCES, type LeadSource, type Pipeline } from '../../types';

const chip = (on: boolean) => cn('rounded-full border px-2.5 py-0.5 text-[12px]', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-line text-ink-2 hover:border-brand-300');

/** Adiciona contatos em massa a uma etapa, a partir de filtros. Um contato fica em só uma etapa por funil. */
export function BulkAddModal({ pipeline, stageId, onClose }: { pipeline: Pipeline; stageId: string | null; onClose: () => void }) {
  const contacts = useStore((s) => s.contacts);
  const deals = useStore((s) => s.deals);
  const tags = useStore((s) => s.tags);
  const users = useStore((s) => s.users);
  const { add, moveDeal, toast } = useStore.getState();
  const [target, setTarget] = useState(stageId ?? pipeline.stages[0]!.id);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [owner, setOwner] = useState('');
  const [moveExisting, setMoveExisting] = useState(false);

  const result = useMemo(() => {
    const inFunnel = new Map(deals.filter((d) => d.pipelineId === pipeline.id && d.status === 'aberto').map((d) => [d.contactId, d]));
    const matches = contacts.filter(
      (c) => (!tagIds.length || c.tagIds.some((t) => tagIds.includes(t))) && (!sources.length || sources.includes(c.source)) && (!owner || c.ownerId === owner),
    );
    const fresh = matches.filter((c) => !inFunnel.has(c.id));
    const movable = matches.map((c) => inFunnel.get(c.id)).filter((d) => d && d.stageId !== target);
    return { fresh, movable: movable as NonNullable<(typeof movable)[number]>[], total: matches.length };
  }, [contacts, deals, pipeline.id, tagIds, sources, owner, target]);

  if (!stageId) return null;
  const count = result.fresh.length + (moveExisting ? result.movable.length : 0);

  const apply = () => {
    for (const c of result.fresh)
      add('deals', {
        id: uid('dea-'),
        pipelineId: pipeline.id,
        stageId: target,
        contactId: c.id,
        title: `Oportunidade — ${c.name}`,
        value: 0,
        ownerId: c.ownerId,
        productIds: [],
        status: 'aberto',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    if (moveExisting) for (const d of result.movable) moveDeal(d.id, target);
    toast(`${count} contato(s) adicionados à etapa`);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar contatos à etapa"
      size="lg"
      footer={
        <Button disabled={count === 0} onClick={apply}>
          Adicionar {count}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Etapa de destino">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            {pipeline.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-ink-2">Etiquetas (qualquer uma)</div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <button key={t.id} className={chip(tagIds.includes(t.id))} onClick={() => setTagIds(tagIds.includes(t.id) ? tagIds.filter((x) => x !== t.id) : [...tagIds, t.id])}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-ink-2">Origem</div>
          <div className="flex flex-wrap gap-1.5">
            {LEAD_SOURCES.map((s) => (
              <button key={s} className={chip(sources.includes(s))} onClick={() => setSources(sources.includes(s) ? sources.filter((x) => x !== s) : [...sources, s])}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <Field label="Responsável pelo contato">
          <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Qualquer um</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center justify-between rounded-lg border border-line p-3">
          <span>
            <span className="block text-[13.5px] font-medium">Trazer também quem já está em outra etapa deste funil</span>
            <span className="text-[12.5px] text-ink-3">Um contato fica em só uma etapa por funil: ele é movido, não duplicado.</span>
          </span>
          <Switch checked={moveExisting} onChange={setMoveExisting} />
        </label>
        <div className="rounded-xl bg-canvas p-3 text-[13px] text-ink-2">
          <b>{result.total}</b> contato(s) no filtro · <b>{result.fresh.length}</b> novos no funil · <b>{result.movable.length}</b> já estão em outra etapa
          {!tagIds.length && !sources.length && !owner && <span className="block text-[12px] text-ink-3">Sem filtros = todos os contatos.</span>}
        </div>
      </div>
    </Modal>
  );
}

/** Define quem enxerga o funil. Administradores sempre veem tudo. */
export function VisibilityModal({ pipeline, onClose }: { pipeline: Pipeline | null; onClose: () => void }) {
  const users = useStore((s) => s.users);
  const departments = useStore((s) => s.departments);
  const { update, toast } = useStore.getState();
  const [vis, setVis] = useState(pipeline?.visibility ?? { userIds: [], departmentIds: [], onlyOwn: false });
  if (!pipeline) return null;
  const toggle = (k: 'userIds' | 'departmentIds', id: string) => setVis({ ...vis, [k]: vis[k].includes(id) ? vis[k].filter((x) => x !== id) : [...vis[k], id] });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Quem vê o funil “${pipeline.name}”`}
      footer={
        <Button
          onClick={() => {
            update('pipelines', pipeline.id, { visibility: vis });
            toast('Visibilidade do funil salva');
            onClose();
          }}
        >
          Salvar
        </Button>
      }
    >
      <p className="mb-4 text-[12.5px] text-ink-3">Nada marcado = toda a equipe vê. Administradores sempre têm acesso.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Usuários</div>
          {users
            .filter((u) => u.role !== 'admin')
            .map((u) => (
              <label key={u.id} className="flex items-center gap-2 py-0.5 text-[13px]">
                <input type="checkbox" className="accent-[var(--brand)]" checked={vis.userIds.includes(u.id)} onChange={() => toggle('userIds', u.id)} /> {u.name}
              </label>
            ))}
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Departamentos</div>
          {departments.map((d) => (
            <label key={d.id} className="flex items-center gap-2 py-0.5 text-[13px]">
              <input type="checkbox" className="accent-[var(--brand)]" checked={vis.departmentIds.includes(d.id)} onChange={() => toggle('departmentIds', d.id)} /> {d.name}
            </label>
          ))}
        </div>
      </div>
      <label className="mt-4 flex items-center justify-between rounded-lg border border-line p-3">
        <span>
          <span className="block text-[13.5px] font-medium">Cada um vê só os próprios negócios</span>
          <span className="text-[12.5px] text-ink-3">Quem não é admin enxerga apenas os cards em que é o responsável.</span>
        </span>
        <Switch checked={vis.onlyOwn} onChange={(v) => setVis({ ...vis, onlyOwn: v })} />
      </label>
    </Modal>
  );
}
