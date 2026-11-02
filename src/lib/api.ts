/** Chamadas à API do servidor com o login da equipe (token do Supabase, quando houver). */
import { supabase } from './supabase';

export interface ServerHealth {
  ok: boolean;
  ai: boolean;
  supabase: boolean;
  automation: boolean;
  whatsapp: boolean;
  /** API oficial da Meta configurada no servidor */
  meta?: boolean;
}

let health: Promise<ServerHealth | null> | null = null;

/** /api/health (lido uma vez por sessão). null = servidor fora do ar ou ambiente sem servidor. */
export function serverHealth(): Promise<ServerHealth | null> {
  health ??= fetch('/api/health', { signal: AbortSignal.timeout(2500) })
    .then((r) => (r.ok ? (r.json() as Promise<ServerHealth>) : null))
    .catch(() => null);
  return health;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `erro ${r.status}`);
  return j;
}

export interface WhatsappQr {
  base64: string;
  code: string;
}

export interface WhatsappState {
  instance: string;
  state: 'open' | 'close' | 'connecting';
  qr: WhatsappQr | null;
}
