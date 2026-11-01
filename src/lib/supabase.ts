import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Sem as variáveis do Supabase o CRM roda em modo local (dados no navegador). */
export const isSupabaseMode = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseMode ? createClient(url!, anonKey!) : null;
