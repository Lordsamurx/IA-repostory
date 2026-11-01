import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plug, Plus, QrCode, RefreshCw, Server, ShieldCheck, Smartphone, Trash2, Unplug, XCircle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Badge, Button, Card, Confirm, EmptyState, Field, Input, Modal, PageHeader, Select } from '../components/ui';
import { cn, dateBR, formatPhone, nowIso, onlyDigits, pickColor, uid } from '../lib/utils';
import type { Connection, ConnectionType } from '../types';

const TYPE: Record<ConnectionType, { label: string; desc: string; icon: typeof QrCode }> = {
  qrcode: { label: 'QR Code', desc: 'Mais simples para começar. Igual ao WhatsApp Web.', icon: QrCode },
  api_oficial: { label: 'API oficial (Meta)', desc: 'WhatsApp Cloud API. Sem risco de banimento, ideal para volume.', icon: ShieldCheck },
  parceiro: { label: 'Provedor parceiro', desc: 'Z-API, 360dialog, Twilio ou Gupshup.', icon: Server },
};

function StatusPill({ status }: { status: Connection['status'] }) {
  if (status === 'conectado')
    return (
      <Badge tone="good">
        <CheckCircle2 className="h-3 w-3" /> Conectado
      </Badge>
    );
  if (status === 'aguardando_qr')
    return (
      <Badge tone="warning">
        <QrCode className="h-3 w-3" /> Aguardando QR
      </Badge>
    );
  return (
    <Badge tone="critical">
      <XCircle className="h-3 w-3" /> Desconectado
    </Badge>
  );
}

export default function Conexoes() {
  const connections = useStore((s) => s.connections);
  const conversations = useStore((s) => s.conversations);
  const departments = useStore((s) => s.departments);
  const isAdmin = useStore((s) => s.users.find((u) => u.id === s.sessionUserId)?.role === 'admin');
  const { update, remove, toast } = useStore.getState();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [qrFor, setQrFor] = useState<Connection | null>(null);
  const [deleting, setDeleting] = useState<Connection | null>(null);

  return (
    <div>
      <PageHeader
        title="Conexões"
        subtitle="Números de WhatsApp conectados ao CRM"
        actions={
          isAdmin ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              Conectar novo WhatsApp
            </Button>
          ) : (
            <span className="text-[12.5px] text-ink-3">Só administradores conectam números e leem o QR Code.</span>
          )
        }
      />
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        {connections.length === 0 && (
          <Card>
            <EmptyState icon={<Plug className="h-5 w-5" />} title="Nenhum WhatsApp conectado" text="Conecte o número de atendimento para receber as conversas no Inbox." action={<Button onClick={() => setCreating(true)}>Conectar WhatsApp</Button>} />
          </Card>
        )}
        {connections.map((c) => {
          const T = TYPE[c.type];
          const open = conversations.filter((x) => x.connectionId === c.id && x.status !== 'finalizado').length;
          return (
            <Card key={c.id} className="flex flex-wrap items-center gap-4 p-5">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl text-white" style={{ background: c.color }}>
                <Smartphone className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{c.name}</h3>
                  <StatusPill status={c.status} />
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-ink-3">
                  <span>{c.phone ? formatPhone(c.phone) : 'Número ainda não vinculado'}</span>
                  <span className="flex items-center gap-1">
                    <T.icon className="h-3.5 w-3.5" /> {T.label}
                  </span>
                  <span>Fila: {departments.find((d) => d.id === c.departmentId)?.name ?? '—'}</span>
                  <span>{open} conversa(s) abertas</span>
                  <span>{c.allowedUserIds?.length ? `${c.allowedUserIds.length} usuário(s) podem iniciar conversas` : 'Toda a equipe pode iniciar conversas'}</span>
                  <span>desde {dateBR(c.createdAt)}</span>
                </div>
              </div>
              <div className={cn('flex gap-1.5', !isAdmin && 'hidden')}>
                {c.status === 'conectado' ? (
                  <Button variant="secondary" size="sm" icon={<Unplug className="h-4 w-4" />} onClick={() => (update('connections', c.id, { status: 'desconectado' }), toast('WhatsApp desconectado', 'info'))}>
                    Desconectar
                  </Button>
                ) : (
                  <Button size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={() => (c.type === 'qrcode' ? setQrFor(c) : (update('connections', c.id, { status: 'conectado' }), toast('Reconectado')))}>
                    Reconectar
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setEditing(c)} aria-label="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleting(c)} aria-label="Excluir">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          );
        })}

        <div className="flex gap-3 rounded-xl border border-[#f7cfcf] bg-[#fdf3f3] p-4 text-[13px] text-[#7a2020]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <b>Importante sobre a conexão por QR Code:</b> ela usa uma conexão não oficial do WhatsApp. Funciona bem, mas existe risco de banimento do número. Use um
            número dedicado ao atendimento, nunca o principal do negócio, e evite disparos em massa. Para operações maiores, prefira a API oficial da Meta ou um
            provedor parceiro.
          </div>
        </div>
      </div>

      <NewConnectionModal open={creating} onClose={() => setCreating(false)} onQr={(c) => setQrFor(c)} />
      {editing && <EditConnectionModal connection={editing} onClose={() => setEditing(null)} />}
      {qrFor && <QrModal connection={qrFor} onClose={() => setQrFor(null)} />}
      <Confirm
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Excluir conexão?"
        text="O número deixa de receber mensagens no CRM. O histórico de conversas é mantido."
        onConfirm={() => (deleting && remove('connections', deleting.id), toast('Conexão excluída'))}
      />
    </div>
  );
}

function NewConnectionModal({ open, onClose, onQr }: { open: boolean; onClose: () => void; onQr: (c: Connection) => void }) {
  const departments = useStore((s) => s.departments);
  const { add, toast } = useStore.getState();
  const [type, setType] = useState<ConnectionType>('qrcode');
  const [name, setName] = useState('Atendimento');
  const [dep, setDep] = useState(departments[0]?.id ?? '');
  const [phone, setPhone] = useState('');
  const [provider, setProvider] = useState('Z-API');
  const [token, setToken] = useState('');
  const [phoneId, setPhoneId] = useState('');

  const create = () => {
    const c: Connection = {
      id: uid('con-'),
      name: name.trim(),
      phone: onlyDigits(phone),
      type,
      status: type === 'qrcode' ? 'aguardando_qr' : 'conectado',
      departmentId: dep,
      color: pickColor(name + Date.now()),
      createdAt: nowIso(),
    };
    add('connections', c);
    onClose();
    if (type === 'qrcode') onQr(c);
    else toast(`${TYPE[type].label} conectado`);
  };

  const validApi = type === 'qrcode' || (onlyDigits(phone).length >= 12 && token.trim() && (type === 'parceiro' || phoneId.trim()));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Conectar novo WhatsApp"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!name.trim() || !validApi} onClick={create}>
            {type === 'qrcode' ? 'Gerar QR Code' : 'Conectar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(TYPE) as ConnectionType[]).map((t) => {
          const T = TYPE[t];
          return (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn('rounded-xl border p-4 text-left transition', type === t ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-line hover:border-brand-300')}
            >
              <T.icon className={cn('h-5 w-5', type === t ? 'text-brand-600' : 'text-ink-3')} />
              <div className="mt-2 text-[13.5px] font-semibold">{T.label}</div>
              <div className="mt-0.5 text-[12px] text-ink-3">{T.desc}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Nome da conexão">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Comercial" />
        </Field>
        <Field label="Fila / departamento">
          <Select value={dep} onChange={(e) => setDep(e.target.value)}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        {type !== 'qrcode' && (
          <>
            <Field label="Número com DDI e DDD">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5531999990000" />
            </Field>
            {type === 'api_oficial' ? (
              <Field label="Phone Number ID">
                <Input value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder="Meta Business → WhatsApp → API Setup" />
              </Field>
            ) : (
              <Field label="Provedor">
                <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  {['Z-API', '360dialog', 'Twilio', 'Gupshup'].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field
              label={type === 'api_oficial' ? 'Token de acesso permanente' : 'Token / API key do provedor'}
              className="sm:col-span-2"
              hint="Nesta versão o token só é conferido aqui e não é salvo: o envio real pelo WhatsApp ainda não está ligado (veja docs/WHATSAPP.md)."
            >
              <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
            </Field>
          </>
        )}
      </div>
      {type === 'qrcode' && (
        <div className="mt-4 flex gap-2.5 rounded-lg bg-[#fdf3f3] p-3 text-[12.5px] text-[#7a2020]">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Use um número dedicado ao atendimento. A conexão por QR não é oficial e pode levar a banimento em caso de disparos em massa.
        </div>
      )}
    </Modal>
  );
}

function EditConnectionModal({ connection, onClose }: { connection: Connection; onClose: () => void }) {
  const departments = useStore((s) => s.departments);
  const users = useStore((s) => s.users);
  const { update, toast } = useStore.getState();
  const [name, setName] = useState(connection.name);
  const [dep, setDep] = useState(connection.departmentId ?? '');
  const [allowed, setAllowed] = useState<string[]>(connection.allowedUserIds ?? []);
  return (
    <Modal
      open
      onClose={onClose}
      title="Editar conexão"
      size="sm"
      footer={
        <Button
          onClick={() => {
            update('connections', connection.id, { name, departmentId: dep, allowedUserIds: allowed });
            toast('Conexão atualizada');
            onClose();
          }}
        >
          Salvar
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Fila / departamento">
          <Select value={dep} onChange={(e) => setDep(e.target.value)}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quem pode iniciar conversas por este número" hint="Nenhum marcado = toda a equipe. Responder conversas existentes continua liberado.">
          <div className="space-y-1.5">
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="accent-[var(--brand)]"
                  checked={allowed.includes(u.id)}
                  onChange={(e) => setAllowed(e.target.checked ? [...allowed, u.id] : allowed.filter((x) => x !== u.id))}
                />
                {u.name}
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

/** QR ilustrativo (padrão determinístico) — a leitura real depende do gateway configurado no servidor. */
function FakeQr({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    let h = 0;
    for (const ch of seed) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
    const n = 29;
    const out: [number, number][] = [];
    const finder = (x: number, y: number) => {
      const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
      for (const [ox, oy] of [
        [0, 0],
        [n - 7, 0],
        [0, n - 7],
      ] as const)
        if (inBox(ox, oy)) {
          const dx = x - ox;
          const dy = y - oy;
          return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) ? 1 : 0;
        }
      return -1;
    };
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const f = finder(x, y);
        h = (h * 1103515245 + 12345) >>> 0;
        if (f === 1 || (f === -1 && (h >>> 16) % 2 === 0)) out.push([x, y]);
      }
    return out;
  }, [seed]);
  return (
    <svg viewBox="-2 -2 33 33" className="h-56 w-56" role="img" aria-label="QR Code de conexão">
      <rect x="-2" y="-2" width="33" height="33" fill="white" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0e1f2b" />
      ))}
    </svg>
  );
}

function QrModal({ connection, onClose }: { connection: Connection; onClose: () => void }) {
  const { update, toast } = useStore.getState();
  const [phone, setPhone] = useState(connection.phone);
  const [step, setStep] = useState<'qr' | 'pairing'>('qr');
  const [seed, setSeed] = useState(String(Date.now()));

  const confirm = () => {
    setStep('pairing');
    setTimeout(() => {
      update('connections', connection.id, { status: 'conectado', phone: onlyDigits(phone) });
      toast('WhatsApp conectado! Envie uma mensagem de outro número para testar.');
      onClose();
    }, 1400);
  };

  return (
    <Modal open onClose={onClose} title={`Conectar “${connection.name}”`} size="lg">
      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-2xl border border-line p-3">{step === 'qr' ? <FakeQr seed={seed} /> : <div className="flex h-56 w-56 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>}</div>
          <button className="flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink" onClick={() => setSeed(String(Date.now()))}>
            <RefreshCw className="h-3.5 w-3.5" /> Gerar novo QR
          </button>
        </div>
        <div>
          <ol className="space-y-3 text-[13.5px]">
            {['Abra o WhatsApp no celular do atendimento', 'Toque em Mais opções (⋮) ou Configurações', 'Toque em Aparelhos conectados → Conectar um aparelho', 'Aponte a câmera para este QR Code'].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand-700">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
          <div className="mt-5 rounded-xl border border-dashed border-line bg-canvas p-3">
            <p className="text-[12.5px] text-ink-3">
              Ambiente sem gateway de WhatsApp configurado: confirme o número abaixo para concluir a conexão de teste. Em produção, este QR é gerado pelo gateway do
              servidor (veja <code>docs/WHATSAPP.md</code>).
            </p>
            <div className="mt-2 flex gap-2">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5531999990000" />
              <Button disabled={onlyDigits(phone).length < 12 || step === 'pairing'} onClick={confirm}>
                Já escaneei
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
