import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Button, Field, Input, Modal, Select, Tabs, Textarea } from '../ui';
import { formatPhone, normalize, onlyDigits } from '../../lib/utils';

export default function NewConversationModal({ open, onClose, onCreated, contactId }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; contactId?: string }) {
  const contacts = useStore((s) => s.contacts);
  const connections = useStore((s) => s.connections);
  const { createContact, startConversation, sendMessage } = useStore.getState();

  const [mode, setMode] = useState<'existente' | 'novo'>('existente');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(contactId ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [connectionId, setConnectionId] = useState(connections.find((c) => c.status === 'conectado')?.id ?? '');
  const [message, setMessage] = useState('Olá {{nome}}! Aqui é da {{empresa}}. ');

  const filtered = contacts.filter((c) => !search || normalize(c.name).includes(normalize(search)) || c.phone.includes(onlyDigits(search) || '§')).slice(0, 8);
  const valid = mode === 'existente' ? Boolean(selected) : name.trim() && onlyDigits(phone).length >= 10;

  const create = () => {
    let cid = selected;
    if (mode === 'novo') {
      const d = onlyDigits(phone);
      cid = createContact({ name: name.trim(), phone: d.startsWith('55') ? d : `55${d}`, source: 'WhatsApp', tagIds: [] }).id;
    }
    const conv = startConversation(cid, connectionId);
    if (message.trim()) sendMessage(conv, message.trim());
    onCreated(conv);
    onClose();
    setName('');
    setPhone('');
    setSelected('');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova conversa"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={create}>
            Iniciar conversa
          </Button>
        </>
      }
    >
      <Tabs
        value={mode}
        onChange={setMode}
        items={[
          { value: 'existente', label: 'Contato existente' },
          { value: 'novo', label: 'Novo número' },
        ]}
        className="mb-4"
      />
      {mode === 'existente' ? (
        <div className="space-y-2">
          <Input placeholder="Buscar contato…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
            {filtered.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-2 text-[13px] last:border-0 hover:bg-canvas">
                <input type="radio" name="contact" checked={selected === c.id} onChange={() => setSelected(c.id)} className="accent-[var(--brand)]" />
                <span className="flex-1 font-medium">{c.name}</span>
                <span className="text-ink-3">{formatPhone(c.phone)}</span>
              </label>
            ))}
            {filtered.length === 0 && <p className="p-4 text-center text-[13px] text-ink-3">Nenhum contato encontrado.</p>}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="WhatsApp (com DDD)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(31) 99999-0000" />
          </Field>
        </div>
      )}
      <div className="mt-4 space-y-3">
        <Field label="Enviar pela conexão">
          <Select value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {formatPhone(c.phone)} {c.status !== 'conectado' ? '(desconectado)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Primeira mensagem" hint="Variáveis: {{nome}} e {{empresa}}">
          <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
