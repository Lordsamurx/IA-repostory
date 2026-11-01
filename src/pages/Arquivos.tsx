import { useMemo, useRef, useState, type DragEvent } from 'react';
import { Download, FileText, Folder, FolderPlus, FolderOpen, Pencil, Trash2, Upload } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Button, Card, Confirm, EmptyState, Field, Input, Modal, PageHeader, SearchInput, Select } from '../components/ui';
import { isImageMime } from '../components/inbox/ChatModals';
import { cn, dateBR, normalize, nowIso, uid } from '../lib/utils';
import type { FileAsset } from '../types';

/** Os arquivos ficam dentro do próprio banco/navegador: limite por arquivo para não estourar o armazenamento. */
const MAX_BYTES = 1_000_000;
const ALLOWED = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/(plain|csv)|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-excel))$/;

const size = (b: number) => (b < 1024 ? `${b} B` : b < 1_048_576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1_048_576).toFixed(1)} MB`);

export default function Arquivos() {
  const files = useStore((s) => s.files);
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.sessionUserId);
  const { add, update, remove, toast } = useStore.getState();
  const [folder, setFolder] = useState('');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<FileAsset | null>(null);
  const [editing, setEditing] = useState<FileAsset | null>(null);
  const [deleting, setDeleting] = useState<FileAsset | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const folders = useMemo(() => [...new Set([...files.map((f) => f.folder), ...extraFolders])].sort(), [files, extraFolders]);
  const list = files
    .filter((f) => (!folder || f.folder === folder) && (!query || normalize(f.name).includes(normalize(query))))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const upload = (fl: FileList | File[] | null) => {
    if (!fl) return;
    let ok = 0;
    for (const f of Array.from(fl)) {
      if (!ALLOWED.test(f.type)) {
        toast(`"${f.name}": tipo não permitido (use imagem, PDF, texto, Word ou Excel)`, 'error');
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast(`"${f.name}" passa de 1 MB`, 'error');
        continue;
      }
      ok++;
      const reader = new FileReader();
      reader.onload = () =>
        add('files', {
          id: uid('fil-'),
          name: f.name,
          folder: folder || 'Geral',
          mime: f.type,
          size: f.size,
          data: String(reader.result),
          createdBy: me ?? undefined,
          createdAt: nowIso(),
        });
      reader.readAsDataURL(f);
    }
    if (ok) toast(`${ok} arquivo(s) salvo(s) em ${folder || 'Geral'}`);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    upload(e.dataTransfer.files);
  };

  return (
    <div>
      <PageHeader
        title="Arquivos"
        subtitle="Biblioteca da empresa: catálogos, tabelas de preço e imagens para enviar no chat com um clique (clipe → Da biblioteca)"
        actions={
          <>
            <input ref={inputRef} type="file" multiple hidden onChange={(e) => (upload(e.target.files), (e.target.value = ''))} />
            <Button variant="secondary" icon={<FolderPlus className="h-4 w-4" />} onClick={() => setNewFolder('')}>
              Nova pasta
            </Button>
            <Button icon={<Upload className="h-4 w-4" />} onClick={() => inputRef.current?.click()}>
              Enviar arquivos
            </Button>
          </>
        }
      />
      <div className="grid gap-6 p-6 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-0.5">
          {['', ...folders].map((f) => (
            <button
              key={f || 'all'}
              onClick={() => setFolder(f)}
              className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px]', folder === f ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-2 hover:bg-surface')}
            >
              {folder === f ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
              <span className="flex-1 truncate">{f || 'Todos os arquivos'}</span>
              <span className="text-[11px] text-ink-3">{f ? files.filter((x) => x.folder === f).length : files.length}</span>
            </button>
          ))}
        </nav>

        <div
          onDragOver={(e) => (e.preventDefault(), setDragOver(true))}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn('min-h-[300px] rounded-2xl transition', dragOver && 'bg-brand-50 ring-2 ring-brand-400 ring-dashed')}
        >
          <div className="mb-4 flex items-center gap-2">
            <SearchInput placeholder="Buscar arquivo" value={query} onChange={(e) => setQuery(e.target.value)} className="w-64" />
            <span className="ml-auto text-[12px] text-ink-3">Arraste arquivos para cá · até 1 MB cada</span>
          </div>
          {list.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FolderOpen className="h-5 w-5" />}
                title={folder ? `A pasta “${folder}” está vazia` : 'Nenhum arquivo ainda'}
                text="Envie aqui o que a equipe manda sempre: catálogo, tabela de preços, fotos de antes e depois, mapa de como chegar."
                action={<Button onClick={() => inputRef.current?.click()}>Enviar arquivos</Button>}
              />
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {list.map((f) => (
                <Card key={f.id} className="group overflow-hidden">
                  <button onClick={() => setPreview(f)} className="flex h-32 w-full items-center justify-center bg-canvas">
                    {isImageMime(f.mime) ? <img src={f.data} alt="" className="h-full w-full object-cover" /> : <FileText className="h-10 w-10 text-ink-3" />}
                  </button>
                  <div className="p-3">
                    <div className="truncate text-[13px] font-medium" title={f.name}>
                      {f.name}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[11.5px] text-ink-3">
                      <span>
                        {size(f.size)} · {dateBR(f.createdAt, { day: '2-digit', month: '2-digit' })}
                      </span>
                      <span className="flex opacity-0 transition group-hover:opacity-100">
                        <button aria-label="Editar" className="rounded p-1 hover:bg-canvas" onClick={() => setEditing(f)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button aria-label="Excluir" className="rounded p-1 hover:bg-canvas hover:text-critical" onClick={() => setDeleting(f)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-ink-3">
                      {f.folder} · por {users.find((u) => u.id === f.createdBy)?.name.split(' ')[0] ?? '—'}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.name ?? ''} size="lg">
        {preview && (
          <div className="space-y-3">
            {isImageMime(preview.mime) ? (
              <img src={preview.data} alt={preview.name} className="mx-auto max-h-[60vh] rounded-lg" />
            ) : preview.mime.startsWith('text/') ? (
              <pre className="max-h-[50vh] overflow-auto rounded-lg bg-canvas p-3 text-[12.5px] whitespace-pre-wrap">{decodeText(preview.data)}</pre>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-ink-3">
                <FileText className="h-10 w-10" /> Pré-visualização indisponível para este tipo de arquivo.
              </div>
            )}
            <div className="flex justify-end">
              <a href={preview.data} download={preview.name} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px] hover:bg-canvas">
                <Download className="h-4 w-4" /> Baixar
              </a>
            </div>
          </div>
        )}
      </Modal>

      {editing && (
        <EditFile
          file={editing}
          folders={folders}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            update('files', editing.id, patch);
            toast('Arquivo atualizado');
          }}
        />
      )}

      <Modal
        open={newFolder !== null}
        onClose={() => setNewFolder(null)}
        title="Nova pasta"
        size="sm"
        footer={
          <Button
            disabled={!newFolder?.trim()}
            onClick={() => {
              const name = newFolder!.trim();
              setExtraFolders((x) => [...x, name]);
              setFolder(name);
              setNewFolder(null);
            }}
          >
            Criar
          </Button>
        }
      >
        <Input autoFocus placeholder="Ex.: Catálogos" value={newFolder ?? ''} onChange={(e) => setNewFolder(e.target.value)} />
        <p className="mt-2 text-[12px] text-ink-3">A pasta fica salva assim que você enviar o primeiro arquivo nela.</p>
      </Modal>

      <Confirm open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Excluir arquivo?" text={`"${deleting?.name}" sai da biblioteca. Mensagens já enviadas não são afetadas.`} onConfirm={() => (deleting && remove('files', deleting.id), toast('Arquivo excluído'))} />
    </div>
  );
}

function decodeText(dataUrl: string) {
  try {
    const b64 = dataUrl.split(',')[1] ?? '';
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return '(não foi possível ler o arquivo)';
  }
}

function EditFile({ file, folders, onClose, onSave }: { file: FileAsset; folders: string[]; onClose: () => void; onSave: (p: Partial<FileAsset>) => void }) {
  const [name, setName] = useState(file.name);
  const [folder, setFolder] = useState(file.folder);
  return (
    <Modal
      open
      onClose={onClose}
      title="Editar arquivo"
      size="sm"
      footer={
        <Button disabled={!name.trim() || !folder.trim()} onClick={() => (onSave({ name: name.trim(), folder: folder.trim() }), onClose())}>
          Salvar
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Pasta" hint="Escolha uma existente ou digite um nome novo">
          <Input list="pastas" value={folder} onChange={(e) => setFolder(e.target.value)} />
          <datalist id="pastas">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Field>
        {folders.length > 0 && (
          <Select value="" onChange={(e) => e.target.value && setFolder(e.target.value)} aria-label="Mover para pasta">
            <option value="">Mover para…</option>
            {folders.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        )}
      </div>
    </Modal>
  );
}
