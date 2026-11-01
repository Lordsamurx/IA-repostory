/**
 * Worker de automação do servidor (roda 24 h, sem navegador aberto).
 *
 * É o mesmo código de regras do CRM (store + src/lib), empacotado para Node pelo
 * `npm run build:worker` em server/worker/automation.mjs e carregado pelo server/index.mjs.
 *
 *  - Lê e grava o banco com a chave service_role (só no servidor, nunca no navegador).
 *  - Recebe as mensagens do WhatsApp (webhook) e executa NPS → chatbot → agente de IA.
 *  - A cada 15 s: follow-ups, disparos e mensagens agendadas.
 *  - Caixa de saída: envia pelo gateway as mensagens de saída das conexões reais,
 *    venham elas da equipe (navegador) ou das automações.
 */
import { createClient } from '@supabase/supabase-js';
import { useStore, type Store } from '../store/useStore';
import { host } from '../lib/host';
import { setAiTransport, type AiReply } from '../lib/ai';
import { flush, loadForServer, reconcileRemote, startSync, useSyncClient } from '../lib/sync';
import { startAutomation, stopAutomation } from '../lib/automation';
import {
  applyAck,
  applyConnectionState,
  markFailed,
  markSent,
  pendingOutbound,
  receiveWhatsApp,
  type InboundMessage,
  type InboundResult,
} from '../lib/whatsapp';

export type WorkerEvent =
  | { type: 'message'; message: InboundMessage }
  | { type: 'ack'; id: string; status: 'delivered' | 'read' }
  | { type: 'connection'; instance: string; state: 'open' | 'close' | 'connecting'; phone?: string };

export interface WorkerOptions {
  supabaseUrl: string;
  serviceKey: string;
  /** Resposta da IA direto no processo (sem HTTP). Ausente = motor local. */
  ai?: (body: Record<string, unknown>) => Promise<AiReply>;
  /** Envio pelo gateway. Ausente = mensagens de conexões reais ficam aguardando. */
  sendText?: (instance: string, phone: string, text: string) => Promise<{ id?: string }>;
  log?: (...args: unknown[]) => void;
  /** Mensagens mais antigas que isso não são enviadas (servidor voltando de uma queda). */
  outboxMaxAgeMs?: number;
}

export interface Worker {
  ingest: (event: WorkerEvent) => InboundResult | boolean;
  hasInstance: (instance: string) => boolean;
  stats: () => { contacts: number; conversations: number; messages: number; pendingOutbound: number };
  stop: () => Promise<void>;
}

type Proc = { env: Record<string, string | undefined> };
const proc = (globalThis as { process?: Proc }).process;

/** Horários (agentes, follow-ups) seguem o fuso configurado no CRM, não o do servidor. */
function applyTimezone(tz: string | undefined) {
  if (!proc || !tz) return;
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: tz });
    if (proc.env.TZ !== tz) proc.env.TZ = tz;
  } catch {
    /* fuso inválido: mantém o do servidor */
  }
}

export async function startWorker(opts: WorkerOptions): Promise<Worker> {
  const log = opts.log ?? ((...a: unknown[]) => console.log(...a));
  const maxAge = opts.outboxMaxAgeMs ?? 10 * 60_000;
  host.server = true;

  // sem tela: avisos viram log
  useStore.setState({ toast: (text: string, tone = 'info') => log(`[worker] ${tone}: ${text}`) } as Partial<Store>);
  setAiTransport({
    available: async () => Boolean(opts.ai),
    reply: (body) => opts.ai!(body),
  });

  const client = createClient(opts.supabaseUrl, opts.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  useSyncClient(client, (text) => log(`[worker] ${text}`));
  await loadForServer();
  applyTimezone(useStore.getState().settings.timezone);

  let lastStatus = '';
  startSync((status) => {
    if (status === lastStatus) return;
    log(`[worker] realtime: ${status}`);
    // voltou depois de uma queda: busca o que mudou enquanto estava fora
    if (status === 'SUBSCRIBED' && lastStatus && lastStatus !== 'SUBSCRIBED') {
      reconcileRemote().catch((e: unknown) => log('[worker] falha ao ressincronizar', e));
    }
    lastStatus = status;
  });
  await startAutomation();

  // ------------------------------------------------------------ caixa de saída
  const inflight = new Set<string>();
  let drainTimer: ReturnType<typeof setTimeout> | null = null;
  const drain = () => {
    drainTimer = null;
    if (!opts.sendText) return;
    for (const item of pendingOutbound(maxAge)) {
      if (inflight.has(item.messageId)) continue;
      inflight.add(item.messageId);
      opts
        .sendText(item.instance, item.phone, item.text)
        .then((r) => markSent(item.messageId, r.id))
        .catch((e: unknown) => {
          log('[worker] envio falhou', item.messageId, e instanceof Error ? e.message : e);
          markFailed(item.messageId, 'O WhatsApp não aceitou o envio. Confira a conexão e tente de novo.');
        })
        .finally(() => inflight.delete(item.messageId));
    }
  };
  const scheduleDrain = () => {
    drainTimer ??= setTimeout(drain, 150);
  };
  let lastMessages = useStore.getState().messages;
  let lastTz = useStore.getState().settings.timezone;
  const unsubscribe = useStore.subscribe((s) => {
    if (s.messages !== lastMessages) {
      lastMessages = s.messages;
      scheduleDrain();
    }
    if (s.settings.timezone !== lastTz) {
      lastTz = s.settings.timezone;
      applyTimezone(lastTz);
    }
  });
  const retry = setInterval(scheduleDrain, 5_000);
  scheduleDrain();

  const st = useStore.getState();
  log(`[worker] automação no servidor ligada: ${st.contacts.length} contatos, ${st.conversations.length} conversas, ${st.connections.filter((c) => c.instance).length} conexão(ões) WhatsApp`);

  return {
    ingest(event) {
      switch (event.type) {
        case 'message':
          return receiveWhatsApp(event.message);
        case 'ack':
          return applyAck(event.id, event.status);
        case 'connection':
          return applyConnectionState(event.instance, event.state, event.phone);
      }
    },
    hasInstance: (instance) => useStore.getState().connections.some((c) => c.instance === instance),
    stats() {
      const s = useStore.getState();
      return { contacts: s.contacts.length, conversations: s.conversations.length, messages: s.messages.length, pendingOutbound: inflight.size };
    },
    async stop() {
      stopAutomation();
      clearInterval(retry);
      if (drainTimer) clearTimeout(drainTimer);
      unsubscribe();
      await flush();
      await client.removeAllChannels();
      client.realtime.disconnect();
    },
  };
}
