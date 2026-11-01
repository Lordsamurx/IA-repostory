import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from 'react';
import { CheckCircle2, Info, Search, X, XCircle } from 'lucide-react';
import { cn, initials } from '../lib/utils';
import { useStore } from '../store/useStore';

/* ---------------------------------------------------------------- Button */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-ink border border-line hover:bg-canvas',
  ghost: 'text-ink-2 hover:bg-canvas hover:text-ink',
  danger: 'bg-critical text-white hover:brightness-95',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon, className, children, ...rest }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  ),
);

export function IconButton({
  label,
  className,
  children,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-canvas hover:text-ink',
        active && 'bg-brand-50 text-brand-700',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- Inputs */
const field =
  'w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-3 outline-none transition focus:border-brand-500 focus:ring-3 focus:ring-brand-100 disabled:bg-canvas';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, 'h-9', className)} {...p} />
));

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, 'py-2 leading-relaxed', className)} {...p} />,
);

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(field, 'h-9 pr-8', className)} {...p}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function SearchInput({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" />
      <Input className="pl-9" {...p} />
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-brand-500' : 'bg-[#cfd6dd]',
      )}
    >
      <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
    </button>
  );
}

/* ---------------------------------------------------------------- Display */
export function Avatar({ name, color, size = 36, presence }: { name: string; color?: string; size?: number; presence?: 'online' | 'ausente' | 'offline' }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="inline-flex h-full w-full items-center justify-center rounded-full font-semibold text-white select-none"
        style={{ background: color ?? '#8592a0', fontSize: size * 0.38 }}
      >
        {initials(name) || '?'}
      </span>
      {presence && (
        <span
          title={presence}
          className={cn(
            'absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full ring-2 ring-white',
            presence === 'online' ? 'bg-good' : presence === 'ausente' ? 'bg-warning' : 'bg-ink-3',
          )}
        />
      )}
    </span>
  );
}

export function Badge({ children, className, tone = 'neutral' }: { children: ReactNode; className?: string; tone?: 'neutral' | 'brand' | 'good' | 'warning' | 'critical' | 'info' }) {
  const tones = {
    neutral: 'bg-canvas text-ink-2 border-line',
    brand: 'bg-brand-50 text-brand-700 border-brand-100',
    good: 'bg-[#e8f6e8] text-[#0b6b0b] border-[#c9ebc9]',
    warning: 'bg-[#fff6e0] text-[#8a5a00] border-[#fde7b0]',
    critical: 'bg-[#fdecec] text-[#a52828] border-[#f7cfcf]',
    info: 'bg-[#e9f1fc] text-[#1c5cab] border-[#cde2fb]',
  } as const;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

export function TagChip({ name, color, onRemove }: { name: string; color: string; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ background: `color-mix(in oklab, ${color} 14%, white)`, color: `color-mix(in oklab, ${color} 75%, black)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {name}
      {onRemove && (
        <button onClick={onRemove} aria-label={`Remover ${name}`} className="-mr-0.5 opacity-60 hover:opacity-100">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line bg-surface px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">{icon}</div>
      <p className="font-medium text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-[13px] text-ink-3">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto', className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
            value === it.value ? 'bg-brand-50 text-brand-700' : 'text-ink-2 hover:bg-canvas',
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span className={cn('rounded-full px-1.5 text-[11px]', value === it.value ? 'bg-brand-500 text-white' : 'bg-canvas text-ink-3')}>
              {it.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Overlays */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0e1f2b]/45 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('animate-in w-full rounded-2xl bg-surface shadow-pop', w)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <IconButton label="Fechar" onClick={onClose} className="-mr-2">
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#0e1f2b]/35" onMouseDown={onClose}>
      <aside role="dialog" aria-label={title} className="flex h-full w-full max-w-md flex-col bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <IconButton label="Fechar" onClick={onClose} className="-mr-2">
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </aside>
    </div>
  );
}

export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  text,
  confirmLabel = 'Excluir',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  text: string;
  confirmLabel?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">{text}</p>
    </Modal>
  );
}

/** Menu suspenso simples, fecha ao clicar fora */
export function Menu({ trigger, children, align = 'right', width = 220 }: { trigger: (open: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger(() => setOpen((v) => !v))}
      {open && (
        <div
          className={cn('animate-in absolute z-40 mt-1 rounded-xl border border-line bg-surface p-1 shadow-pop', align === 'right' ? 'right-0' : 'left-0')}
          style={{ width }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, onClick, icon, danger }: { children: ReactNode; onClick: () => void; icon?: ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-canvas', danger ? 'text-critical' : 'text-ink')}
    >
      {icon && <span className="text-ink-3 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </button>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} role="status" className="animate-in pointer-events-auto flex min-w-64 items-center gap-2.5 rounded-xl bg-[#0e1f2b] px-4 py-3 text-sm text-white shadow-pop">
          {t.tone === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-[#4ade80]" />
          ) : t.tone === 'error' ? (
            <XCircle className="h-4 w-4 text-[#f87171]" />
          ) : (
            <Info className="h-4 w-4 text-[#93c5fd]" />
          )}
          <span className="flex-1">{t.text}</span>
          <button onClick={() => dismiss(t.id)} aria-label="Fechar aviso" className="opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function StatTile({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-ink-3">{label}</span>
        {icon && <span className="text-ink-3 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </Card>
  );
}
