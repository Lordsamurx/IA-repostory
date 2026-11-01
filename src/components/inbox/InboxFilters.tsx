import { SlidersHorizontal, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Button, Menu, Select } from '../ui';
import { cn } from '../../lib/utils';

export type TagMode = 'qualquer' | 'todas' | 'nao_tem';
export type SortMode = 'recentes' | 'antigas' | 'nao_lidas';

export interface ChatFilters {
  connectionId: string;
  tagIds: string[];
  tagMode: TagMode;
  /** '' | 'none' | 'u:<id>' | 'd:<id>' */
  responsible: string;
  stageId: string;
  unread: boolean;
  favorites: boolean;
  scheduled: boolean;
  sort: SortMode;
}

export const EMPTY_FILTERS: ChatFilters = {
  connectionId: '',
  tagIds: [],
  tagMode: 'qualquer',
  responsible: '',
  stageId: '',
  unread: false,
  favorites: false,
  scheduled: false,
  sort: 'recentes',
};

export const activeCount = (f: ChatFilters) =>
  [f.connectionId, f.tagIds.length, f.responsible, f.stageId, f.unread, f.favorites, f.scheduled, f.sort !== 'recentes'].filter(Boolean).length;

const chip = (on: boolean) => cn('shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] transition', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-line text-ink-2 hover:border-brand-300');

export default function InboxFilters({ value, onChange }: { value: ChatFilters; onChange: (f: ChatFilters) => void }) {
  const connections = useStore((s) => s.connections);
  const tags = useStore((s) => s.tags);
  const users = useStore((s) => s.users);
  const departments = useStore((s) => s.departments);
  const pipelines = useStore((s) => s.pipelines);
  const set = (patch: Partial<ChatFilters>) => onChange({ ...value, ...patch });
  const n = activeCount(value);

  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        <button className={chip(value.unread)} onClick={() => set({ unread: !value.unread })}>
          Não lidas
        </button>
        <button className={chip(value.favorites)} onClick={() => set({ favorites: !value.favorites })}>
          ★ Favoritos
        </button>
        <button className={chip(value.scheduled)} onClick={() => set({ scheduled: !value.scheduled })}>
          Agendados
        </button>
      </div>
      <Menu
        width={320}
        trigger={(t) => (
          <button
            onClick={t}
            aria-label="Mais filtros"
            title="Mais filtros: etiquetas, responsável, etapa do funil, conexão e ordenação"
            className={cn('relative flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-[12px] font-medium', n ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-2 hover:bg-canvas')}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {n > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-[10.5px] text-white">{n}</span>}
          </button>
        )}
      >
        {(close) => (
          <div className="space-y-3 p-2 text-[12.5px]">
            <div>
              <div className="mb-1 font-medium text-ink-2">Etiquetas</div>
              <div className="mb-1.5 flex gap-1">
                {(
                  [
                    ['qualquer', 'Qualquer'],
                    ['todas', 'Todas'],
                    ['nao_tem', 'Não tem'],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} onClick={() => set({ tagMode: k })} className={cn('rounded-md px-2 py-0.5', value.tagMode === k ? 'bg-ink text-white' : 'bg-canvas text-ink-2')}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => {
                  const on = value.tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => set({ tagIds: on ? value.tagIds.filter((x) => x !== t.id) : [...value.tagIds, t.id] })}
                      className={cn('rounded-full border px-2 py-0.5 text-[11.5px]', on ? 'border-transparent text-white' : 'border-line text-ink-2')}
                      style={on ? { background: t.color } : undefined}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block font-medium text-ink-2">Responsável</span>
              <Select className="h-8 text-[12.5px]" value={value.responsible} onChange={(e) => set({ responsible: e.target.value })}>
                <option value="">Qualquer um</option>
                <option value="none">Sem responsável</option>
                <optgroup label="Usuários">
                  {users.map((u) => (
                    <option key={u.id} value={`u:${u.id}`}>
                      {u.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Departamentos">
                  {departments.map((d) => (
                    <option key={d.id} value={`d:${d.id}`}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium text-ink-2">Etapa do funil</span>
              <Select className="h-8 text-[12.5px]" value={value.stageId} onChange={(e) => set({ stageId: e.target.value })}>
                <option value="">Qualquer etapa</option>
                {pipelines.map((p) => (
                  <optgroup key={p.id} label={p.name}>
                    {p.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block font-medium text-ink-2">Conexão</span>
                <Select className="h-8 text-[12.5px]" value={value.connectionId} onChange={(e) => set({ connectionId: e.target.value })}>
                  <option value="">Todas</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block font-medium text-ink-2">Ordenar por</span>
                <Select className="h-8 text-[12.5px]" value={value.sort} onChange={(e) => set({ sort: e.target.value as SortMode })}>
                  <option value="recentes">Mais recentes</option>
                  <option value="antigas">Mais antigas</option>
                  <option value="nao_lidas">Não lidas primeiro</option>
                </Select>
              </label>
            </div>
            <div className="flex justify-between border-t border-line pt-2">
              <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => onChange(EMPTY_FILTERS)} disabled={!n}>
                Limpar
              </Button>
              <Button size="sm" onClick={close}>
                Aplicar
              </Button>
            </div>
          </div>
        )}
      </Menu>
    </div>
  );
}
