/**
 * Sincronização com o Supabase (modo produção).
 *
 * Cada registro do CRM vira uma linha em `crm_records (collection, id, data jsonb)`.
 * - Ao entrar: carrega tudo do banco para a store.
 * - Mudanças locais: são comparadas por referência e enviadas em lote (upsert/delete).
 * - Mudanças de outros atendentes: chegam via Realtime e são aplicadas na store.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useStore } from '../store/useStore';
import { COLLECTIONS, type CollectionName, type DataState, DEFAULT_SETTINGS, emptyState } from '../data/seed';
import type { Settings, User } from '../types';

type Row = { collection: string; id: string; data: unknown };
type WithId = { id: string };

const SETTINGS_KEY = { collection: 'settings', id: 'main' };

let synced: Map<string, Map<string, unknown>> = new Map();
let syncedSettings: Settings | null = null;
let unsubscribeStore: (() => void) | null = null;
let channel: RealtimeChannel | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function snapshot(state: DataState) {
  synced = new Map(COLLECTIONS.map((c) => [c, new Map((state[c] as WithId[]).map((x) => [x.id, x]))]));
  syncedSettings = state.settings;
}

export async function loadRemote(authUser: { id: string; email?: string }) {
  if (!supabase) return;
  const rows: Row[] = [];
  // paginação: o PostgREST devolve no máximo 1000 linhas por chamada
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('crm_records').select('collection,id,data').range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as Row[]));
    if (!data || data.length < 1000) break;
  }

  const base = emptyState();
  const state: DataState = { ...base, settings: { ...DEFAULT_SETTINGS } };
  let hasSettings = false;
  const grouped = new Map<string, unknown[]>();
  for (const r of rows) {
    if (r.collection === SETTINGS_KEY.collection) {
      state.settings = { ...DEFAULT_SETTINGS, ...(r.data as Settings) };
      hasSettings = true;
      continue;
    }
    if (!grouped.has(r.collection)) grouped.set(r.collection, []);
    grouped.get(r.collection)!.push(r.data);
  }
  for (const c of COLLECTIONS) {
    // Instalação nova: mantém as etiquetas/funil padrão do emptyState
    if (grouped.has(c) || hasSettings) (state[c] as unknown[]) = grouped.get(c) ?? [];
  }

  // O usuário precisa fazer parte da equipe (criado pelo instalador ou por um administrador)
  const me = state.users.find((u) => u.id === authUser.id || u.email.toLowerCase() === authUser.email?.toLowerCase());
  if (!me) throw new Error('Seu login não está vinculado a nenhuma equipe. Peça ao administrador para adicionar você em Configurações → Equipe.');

  // marca como "já sincronizado" só o que veio do banco, para que o
  // usuário criado agora e os padrões de instalação nova sejam enviados
  synced = new Map(COLLECTIONS.map((c) => [c, new Map(((grouped.get(c) ?? []) as WithId[]).map((x) => [x.id, x]))]));
  syncedSettings = hasSettings ? state.settings : null;

  useStore.setState({ ...state, sessionUserId: me.id, hydrated: true });
  // Recalcula o snapshot com as referências reais da store para as linhas vindas do banco
  const st = useStore.getState();
  for (const c of COLLECTIONS) {
    const map = synced.get(c)!;
    for (const item of st[c] as WithId[]) if (map.has(item.id)) map.set(item.id, item);
  }
  if (hasSettings) syncedSettings = st.settings;
  await flush();
}

async function flush() {
  if (!supabase) return;
  const st = useStore.getState();
  const upserts: Row[] = [];
  const deletes: { collection: string; id: string }[] = [];

  for (const c of COLLECTIONS) {
    const prev = synced.get(c) ?? new Map();
    const next = new Map<string, unknown>();
    for (const item of st[c] as WithId[]) {
      next.set(item.id, item);
      if (prev.get(item.id) !== item) upserts.push({ collection: c, id: item.id, data: item });
    }
    for (const id of prev.keys()) if (!next.has(id)) deletes.push({ collection: c, id });
    synced.set(c, next);
  }
  if (st.settings !== syncedSettings) {
    upserts.push({ ...SETTINGS_KEY, data: st.settings });
    syncedSettings = st.settings;
  }

  if (upserts.length) {
    const { error } = await supabase.from('crm_records').upsert(upserts.map(stripSecrets));
    if (error) useStore.getState().toast(`Erro ao salvar: ${error.message}`, 'error');
  }
  for (const c of new Set(deletes.map((d) => d.collection))) {
    const ids = deletes.filter((d) => d.collection === c).map((d) => d.id);
    const { error } = await supabase.from('crm_records').delete().eq('collection', c).in('id', ids);
    if (error) useStore.getState().toast(`Erro ao excluir: ${error.message}`, 'error');
  }
}

/** Senhas nunca vão para o banco — no Supabase quem cuida disso é o Auth. */
function stripSecrets(r: Row): Row {
  if (r.collection !== 'users') return r;
  const { password: _p, ...rest } = r.data as User;
  return { ...r, data: rest };
}

function applyRemote(row: Row, deleted: boolean) {
  if (row.collection === SETTINGS_KEY.collection) {
    if (deleted) return;
    const settings = { ...DEFAULT_SETTINGS, ...(row.data as Settings) };
    syncedSettings = settings;
    useStore.setState({ settings });
    return;
  }
  const c = row.collection as CollectionName;
  if (!COLLECTIONS.includes(c)) return;
  const map = synced.get(c) ?? new Map();
  const list = useStore.getState()[c] as WithId[];
  if (deleted) {
    map.delete(row.id);
    useStore.setState({ [c]: list.filter((x) => x.id !== row.id) } as Partial<DataState>);
    return;
  }
  const item = row.data as WithId;
  map.set(item.id, item);
  synced.set(c, map);
  const exists = list.some((x) => x.id === item.id);
  useStore.setState({
    [c]: exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item],
  } as Partial<DataState>);
}

export function startSync() {
  if (!supabase || unsubscribeStore) return;
  unsubscribeStore = useStore.subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), 350);
  });
  channel = supabase
    .channel('crm_records')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_records' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        const old = payload.old as Partial<Row>;
        if (old.collection && old.id) applyRemote(old as Row, true);
      } else {
        applyRemote(payload.new as Row, false);
      }
    })
    .subscribe();
}

export function stopSync() {
  unsubscribeStore?.();
  unsubscribeStore = null;
  if (channel && supabase) void supabase.removeChannel(channel);
  channel = null;
  snapshot(emptyState());
}
