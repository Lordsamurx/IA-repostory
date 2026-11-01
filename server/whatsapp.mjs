/**
 * Gateway de WhatsApp: Evolution API v2 (conexão por QR Code).
 *
 *  - createEvolution(): cliente HTTP mínimo (criar instância, QR, estado, desconectar, enviar texto).
 *  - parseWebhook(): converte o webhook da Evolution em eventos do CRM
 *    (mensagem recebida, confirmação de entrega/leitura, estado da conexão).
 *
 * A Evolution muda detalhes do formato entre versões; o parser aceita as variações
 * conhecidas (nome do evento em minúsculas com ponto ou em MAIÚSCULAS, `data` objeto ou lista).
 */

const EVOLUTION_TIMEOUT_MS = 15_000;
export const WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'];

/** Nome da instância no gateway para uma conexão do CRM. */
export function instanceName(prefix, connectionId) {
  const id = String(connectionId ?? '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  return `${prefix}${id}`;
}

export function createEvolution({ url, apiKey, fetch: doFetch = globalThis.fetch }) {
  const base = String(url ?? '').replace(/\/+$/, '');

  async function call(method, path, body) {
    const r = await doFetch(`${base}${path}`, {
      method,
      headers: { apikey: apiKey, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(EVOLUTION_TIMEOUT_MS),
    });
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!r.ok) {
      const err = new Error(`Evolution ${method} ${path.split('/').slice(0, 3).join('/')} → HTTP ${r.status}`);
      err.status = r.status;
      err.detail = text.slice(0, 300);
      throw err;
    }
    return json;
  }

  const webhookConfig = (webhookUrl, token) => ({
    enabled: true,
    url: webhookUrl,
    byEvents: false,
    base64: false,
    headers: { 'x-webhook-token': token },
    events: WEBHOOK_EVENTS,
  });

  const qrOf = (j) => {
    const q = j?.qrcode ?? j ?? {};
    return { base64: typeof q.base64 === 'string' ? q.base64 : '', code: typeof q.code === 'string' ? q.code : '', pairingCode: q.pairingCode ?? null };
  };

  /** 'open' | 'close' | 'connecting' */
  async function state(instance) {
    const j = await call('GET', `/instance/connectionState/${encodeURIComponent(instance)}`);
    const s = j?.instance?.state ?? j?.state;
    return s === 'open' || s === 'connecting' ? s : 'close';
  }

  return {
    state,

    /** Cria a instância (ou reaproveita, se já existir), liga o webhook e devolve o QR. */
    async connect(instance, { webhookUrl, token }) {
      let created = null;
      try {
        created = await call('POST', '/instance/create', {
          instanceName: instance,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          webhook: webhookConfig(webhookUrl, token),
        });
      } catch (err) {
        // 403/409: o nome já existe (instância criada antes) — segue reaproveitando
        if (err.status !== 403 && err.status !== 409) throw err;
      }
      await call('POST', `/webhook/set/${encodeURIComponent(instance)}`, { webhook: webhookConfig(webhookUrl, token) });
      const current = await state(instance).catch(() => 'close');
      if (current === 'open') return { state: current, qr: null };
      let qr = created ? qrOf(created) : null;
      if (!qr?.base64) qr = qrOf(await call('GET', `/instance/connect/${encodeURIComponent(instance)}`));
      return { state: current, qr };
    },

    /** QR novo (o do WhatsApp expira em cerca de 40 s). */
    async qr(instance) {
      return qrOf(await call('GET', `/instance/connect/${encodeURIComponent(instance)}`));
    },

    async logout(instance) {
      await call('DELETE', `/instance/logout/${encodeURIComponent(instance)}`);
    },

    async sendText(instance, number, text) {
      const j = await call('POST', `/message/sendText/${encodeURIComponent(instance)}`, { number, text });
      const id = j?.key?.id ?? j?.message?.key?.id;
      return { id: typeof id === 'string' ? id : undefined };
    },
  };
}

// ------------------------------------------------------------------ webhook
const eventName = (e) => String(e ?? '').toLowerCase().replace(/_/g, '.');
const digitsOf = (jid) => String(jid ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');
const isUserJid = (jid) => typeof jid === 'string' && jid.endsWith('@s.whatsapp.net');

/** Telefone de quem conversa. Contas com privacidade (@lid) trazem o número em outro campo. */
function phoneOf(key) {
  if (isUserJid(key.remoteJid)) return digitsOf(key.remoteJid);
  if (String(key.remoteJid ?? '').endsWith('@lid')) {
    for (const alt of [key.remoteJidAlt, key.senderPn, key.participantAlt]) if (isUserJid(alt)) return digitsOf(alt);
  }
  return ''; // grupo, status, canal ou número desconhecido
}

/** Texto e tipo da mensagem. Mídia entra como aviso: o arquivo em si não é baixado. */
export function contentOf(message) {
  const m = message ?? {};
  const inner = m.ephemeralMessage?.message ?? m.viewOnceMessage?.message ?? m.viewOnceMessageV2?.message ?? m.documentWithCaptionMessage?.message;
  if (inner) return contentOf(inner);
  if (typeof m.conversation === 'string') return { kind: 'text', text: m.conversation };
  if (m.extendedTextMessage) return { kind: 'text', text: String(m.extendedTextMessage.text ?? '') };
  if (m.buttonsResponseMessage) return { kind: 'text', text: String(m.buttonsResponseMessage.selectedDisplayText ?? m.buttonsResponseMessage.selectedButtonId ?? '') };
  if (m.listResponseMessage) return { kind: 'text', text: String(m.listResponseMessage.title ?? m.listResponseMessage.singleSelectReply?.selectedRowId ?? '') };
  if (m.templateButtonReplyMessage) return { kind: 'text', text: String(m.templateButtonReplyMessage.selectedDisplayText ?? '') };
  if (m.imageMessage) return { kind: 'image', text: m.imageMessage.caption ? `📷 ${m.imageMessage.caption}` : '📷 Imagem' };
  if (m.videoMessage) return { kind: 'text', text: m.videoMessage.caption ? `🎬 ${m.videoMessage.caption}` : '🎬 Vídeo' };
  if (m.audioMessage) return { kind: 'audio', text: '🎤 Áudio' };
  if (m.documentMessage) return { kind: 'document', text: String(m.documentMessage.fileName ?? m.documentMessage.title ?? 'Documento') };
  if (m.stickerMessage) return { kind: 'text', text: '🙂 Figurinha' };
  if (m.locationMessage) return { kind: 'text', text: '📍 Localização' };
  if (m.contactMessage || m.contactsArrayMessage) return { kind: 'text', text: '👤 Contato' };
  return null; // reação, protocolo, apagada, etc.
}

const ACK = { DELIVERY_ACK: 'delivered', READ: 'read', PLAYED: 'read', 3: 'delivered', 4: 'read', 5: 'read' };

/** Converte o corpo do webhook numa lista de eventos do worker (pode ser vazia). */
export function parseWebhook(body) {
  if (!body || typeof body !== 'object') return [];
  const event = eventName(body.event);
  const instance = String(body.instance ?? body.data?.instance ?? '');
  if (!instance) return [];
  const raw = body.data;
  const items = Array.isArray(raw) ? raw : Array.isArray(raw?.messages) ? raw.messages : raw ? [raw] : [];
  const out = [];

  if (event === 'messages.upsert') {
    for (const d of items) {
      const key = d?.key ?? {};
      const phone = phoneOf(key);
      const content = contentOf(d?.message);
      if (!phone || !content || !content.text.trim()) continue;
      const ts = Number(d.messageTimestamp);
      out.push({
        type: 'message',
        message: {
          instance,
          id: String(key.id ?? ''),
          fromMe: Boolean(key.fromMe),
          phone,
          name: typeof d.pushName === 'string' ? d.pushName.slice(0, 120) : undefined,
          text: content.text.slice(0, 4000),
          kind: content.kind,
          at: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : undefined,
        },
      });
    }
  } else if (event === 'messages.update') {
    for (const d of items) {
      const id = d?.keyId ?? d?.key?.id ?? d?.messageId;
      const status = ACK[d?.status] ?? ACK[d?.update?.status];
      if (typeof id === 'string' && status && (d?.fromMe ?? d?.key?.fromMe ?? true)) out.push({ type: 'ack', id, status });
    }
  } else if (event === 'connection.update') {
    const d = items[0] ?? {};
    const state = d.state === 'open' || d.state === 'connecting' ? d.state : d.state === 'close' ? 'close' : null;
    if (state) out.push({ type: 'connection', instance, state, phone: d.wuid ? digitsOf(d.wuid) : undefined });
  }
  return out;
}
