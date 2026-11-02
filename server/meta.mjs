/**
 * API oficial do WhatsApp (Meta Cloud API).
 *
 *  - createMeta(): cliente HTTP mínimo (dados do número, enviar texto, enviar template).
 *  - parseMetaWebhook(): converte o webhook da Meta nos mesmos eventos do worker que a
 *    Evolution gera (mensagem recebida, entrega/leitura), mais a falha de envio.
 *  - verifyMetaSignature(): confere o X-Hub-Signature-256 com o App Secret.
 *
 * No CRM, a conexão da Meta usa a instância "meta:<phone_number_id>": o worker, a caixa de
 * saída e o webhook tratam as duas origens do mesmo jeito.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const META_TIMEOUT_MS = 15_000;
export const META_PREFIX = 'meta:';
export const DEFAULT_META_BASE_URL = 'https://graph.facebook.com/v21.0';

export const metaInstance = (phoneId) => `${META_PREFIX}${phoneId}`;
export const isMetaInstance = (instance) => String(instance ?? '').startsWith(META_PREFIX);

/** Mensagens que o atendente entende, para os erros mais comuns da Meta. */
const META_ERRORS = {
  131047: 'Janela de 24 h fechada: envie um template aprovado pela Meta',
  131026: 'O número não tem WhatsApp ou não pode receber mensagens',
  132000: 'Os parâmetros não batem com o template aprovado na Meta',
  132001: 'Template não encontrado ou ainda não aprovado na Meta',
  131056: 'Muitas mensagens para este número em pouco tempo; tente de novo em instantes',
  190: 'Token da Meta expirado ou inválido (WHATSAPP_META_TOKEN)',
};

export function createMeta({ token, phoneId, baseUrl = DEFAULT_META_BASE_URL, fetch: doFetch = globalThis.fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const id = encodeURIComponent(phoneId);

  async function call(method, path, body) {
    const r = await doFetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(META_TIMEOUT_MS),
    });
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!r.ok) {
      const code = json?.error?.code;
      const err = new Error(`Meta ${method} ${path.split('?')[0]} → HTTP ${r.status}${code ? ` (código ${code})` : ''}`);
      err.status = r.status;
      err.code = code;
      err.detail = text.slice(0, 300);
      err.userMessage = META_ERRORS[code];
      throw err;
    }
    return json;
  }

  const send = async (payload) => {
    const j = await call('POST', `/${id}/messages`, { messaging_product: 'whatsapp', recipient_type: 'individual', ...payload });
    const out = j?.messages?.[0]?.id;
    return { id: typeof out === 'string' ? out : undefined };
  };

  return {
    instance: metaInstance(phoneId),

    /** Número e nome verificados (confere também se o token vale). */
    async info() {
      const j = await call('GET', `/${id}?fields=display_phone_number,verified_name`);
      return { phone: String(j?.display_phone_number ?? '').replace(/\D/g, ''), name: String(j?.verified_name ?? '') };
    },

    sendText: (number, text) => send({ to: number, type: 'text', text: { preview_url: false, body: text } }),

    sendTemplate: (number, name, lang = 'pt_BR') => send({ to: number, type: 'template', template: { name, language: { code: lang } } }),
  };
}

/** Assinatura do webhook: HMAC-SHA256 do corpo cru com o App Secret. Sem segredo, nunca confere. */
export function verifyMetaSignature(secret, raw, header) {
  if (!secret) return false;
  const sig = String(header ?? '');
  if (!sig.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// ------------------------------------------------------------------ webhook
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

/** Texto e tipo da mensagem. Mídia entra como aviso: o arquivo em si não é baixado. */
export function metaContentOf(m) {
  switch (m?.type) {
    case 'text':
      return { kind: 'text', text: String(m.text?.body ?? '') };
    case 'button':
      return { kind: 'text', text: String(m.button?.text ?? m.button?.payload ?? '') };
    case 'interactive': {
      const i = m.interactive ?? {};
      return { kind: 'text', text: String(i.button_reply?.title ?? i.list_reply?.title ?? '') };
    }
    case 'image':
      return { kind: 'image', text: m.image?.caption ? `📷 ${m.image.caption}` : '📷 Imagem' };
    case 'video':
      return { kind: 'text', text: m.video?.caption ? `🎬 ${m.video.caption}` : '🎬 Vídeo' };
    case 'audio':
    case 'voice':
      return { kind: 'audio', text: '🎤 Áudio' };
    case 'document':
      return { kind: 'document', text: String(m.document?.filename ?? 'Documento') };
    case 'sticker':
      return { kind: 'text', text: '🙂 Figurinha' };
    case 'location':
      return { kind: 'text', text: '📍 Localização' };
    case 'contacts':
      return { kind: 'text', text: '👤 Contato' };
    default:
      return null; // reação, mensagem apagada, tipo não suportado
  }
}

const ACK = { delivered: 'delivered', read: 'read' };

/** Converte o corpo do webhook da Meta numa lista de eventos do worker (pode ser vazia). */
export function parseMetaWebhook(body) {
  if (!body || typeof body !== 'object' || body.object !== 'whatsapp_business_account') return [];
  const out = [];
  for (const entry of arr(body.entry, 20)) {
    for (const change of arr(entry?.changes, 20)) {
      const v = change?.value;
      const phoneId = v?.metadata?.phone_number_id;
      if (!phoneId) continue;
      const instance = metaInstance(String(phoneId));
      const names = new Map(arr(v.contacts, 50).map((c) => [String(c?.wa_id ?? ''), c?.profile?.name]));

      for (const m of arr(v.messages, 50)) {
        const phone = String(m?.from ?? '').replace(/\D/g, '');
        const content = metaContentOf(m);
        if (!phone || !content || !content.text.trim()) continue;
        const ts = Number(m.timestamp);
        const name = names.get(String(m.from));
        out.push({
          type: 'message',
          message: {
            instance,
            id: String(m.id ?? ''),
            fromMe: false,
            phone,
            name: typeof name === 'string' ? name.slice(0, 120) : undefined,
            text: content.text.slice(0, 4000),
            kind: content.kind,
            at: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : undefined,
          },
        });
      }

      for (const s of arr(v.statuses, 100)) {
        const id = s?.id;
        if (typeof id !== 'string') continue;
        if (ACK[s.status]) out.push({ type: 'ack', instance, id, status: ACK[s.status] });
        else if (s.status === 'failed') {
          const e = s.errors?.[0];
          out.push({ type: 'failed', instance, id, error: META_ERRORS[e?.code] ?? String(e?.title ?? e?.message ?? 'A Meta recusou o envio').slice(0, 300) });
        }
      }
    }
  }
  return out;
}
