import { useMemo, useState } from 'react';
import { FileText, Folder, Image as ImageIcon } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Avatar, Button, Input, Modal } from '../ui';
import { cn, normalize } from '../../lib/utils';
import type { FileAsset, Message } from '../../types';

export const isImageMime = (m: string) => /^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(m);

/** Escolher um arquivo salvo na biblioteca da empresa para enviar no chat. */
export function FileLibraryModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (f: FileAsset) => void }) {
  const files = useStore((s) => s.files);
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('');
  const folders = [...new Set(files.map((f) => f.folder))].sort();
  const list = files.filter((f) => (!folder || f.folder === folder) && (!q || normalize(f.name).includes(normalize(q))));
  return (
    <Modal open={open} onClose={onClose} title="Enviar da biblioteca de arquivos" size="lg">
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder="Buscar arquivo…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
        {['', ...folders].map((f) => (
          <button key={f || 'all'} onClick={() => setFolder(f)} className={cn('rounded-lg border px-2.5 py-1 text-[12.5px]', folder === f ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-2')}>
            {f || 'Todas as pastas'}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="py-10 text-center text-[13px] text-ink-3">Nenhum arquivo. Salve arquivos no menu Arquivos.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {list.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              onPick(f);
              onClose();
            }}
            className="overflow-hidden rounded-xl border border-line text-left hover:border-brand-400 hover:shadow-card"
          >
            <div className="flex h-24 items-center justify-center bg-canvas">
              {isImageMime(f.mime) ? <img src={f.data} alt="" className="h-full w-full object-cover" /> : <FileText className="h-8 w-8 text-ink-3" />}
            </div>
            <div className="p-2">
              <div className="truncate text-[12.5px] font-medium">{f.name}</div>
              <div className="flex items-center gap-1 text-[11px] text-ink-3">
                {isImageMime(f.mime) ? <ImageIcon className="h-3 w-3" /> : <Folder className="h-3 w-3" />} {f.folder}
              </div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Encaminhar uma mensagem para uma ou mais conversas. */
export function ForwardModal({ message, onClose }: { message: Message | null; onClose: () => void }) {
  const conversations = useStore((s) => s.conversations);
  const contacts = useStore((s) => s.contacts);
  const { sendMessage, toast } = useStore.getState();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const MAX = 20;
  const list = useMemo(
    () =>
      conversations
        .filter((c) => c.id !== message?.conversationId)
        .map((c) => ({ c, ct: contacts.find((x) => x.id === c.contactId) }))
        .filter(({ ct }) => ct && (!q || normalize(ct.name).includes(normalize(q)) || ct.phone.includes(q)))
        .slice(0, 50),
    [conversations, contacts, q, message],
  );
  if (!message) return null;
  return (
    <Modal
      open
      onClose={() => (setSel([]), onClose())}
      title="Encaminhar mensagem"
      footer={
        <Button
          disabled={!sel.length}
          onClick={() => {
            for (const id of sel)
              sendMessage(id, message.body, { kind: message.kind === 'note' ? 'text' : message.kind, fileName: message.fileName, fileData: message.fileData, forwarded: true, raw: true });
            toast(`Mensagem encaminhada para ${sel.length} conversa(s)`);
            setSel([]);
            onClose();
          }}
        >
          Encaminhar ({sel.length})
        </Button>
      }
    >
      <p className="mb-3 line-clamp-2 rounded-lg bg-canvas px-3 py-2 text-[13px] text-ink-2">{message.kind === 'image' ? `🖼️ ${message.fileName ?? 'Imagem'}` : message.fileName ?? message.body}</p>
      <Input placeholder="Buscar conversa…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-line">
        {list.map(({ c, ct }) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-2 text-[13px] last:border-0 hover:bg-canvas">
            <input
              type="checkbox"
              className="accent-[var(--brand)]"
              checked={sel.includes(c.id)}
              disabled={!sel.includes(c.id) && sel.length >= MAX}
              onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))}
            />
            <Avatar name={ct!.name} color={ct!.color} size={24} />
            <span className="flex-1">{ct!.name}</span>
            <span className="text-[11px] text-ink-3 capitalize">{c.status.replace('_', ' ')}</span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-ink-3">Limite de {MAX} conversas por encaminhamento.</p>
    </Modal>
  );
}
