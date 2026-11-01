import type { CustomField } from '../types';
import { Input, Select, Textarea } from './ui';
import { cn } from '../lib/utils';

/** Campo personalizado do contato, renderizado conforme o tipo. */
export default function CustomFieldInput({ field, value, onChange, compact }: { field: CustomField; value?: string; onChange: (v: string) => void; compact?: boolean }) {
  const cls = cn(compact && 'h-8 text-[13px]');
  if (field.type === 'lista')
    return (
      <Select className={cls} value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={field.name}>
        <option value="">—</option>
        {field.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </Select>
    );
  if (field.type === 'texto_longo')
    return (
      <Textarea
        rows={2}
        className={cn(compact && 'text-[13px]')}
        aria-label={field.name}
        defaultValue={value ?? ''}
        key={value ?? ''}
        onBlur={(e) => e.target.value !== (value ?? '') && onChange(e.target.value)}
      />
    );
  return (
    <Input
      className={cls}
      aria-label={field.name}
      type={{ numero: 'number', data: 'date', hora: 'time', email: 'email', texto: 'text', lista: 'text', texto_longo: 'text' }[field.type]}
      defaultValue={value ?? ''}
      key={value ?? ''}
      onBlur={(e) => e.target.value !== (value ?? '') && onChange(e.target.value)}
    />
  );
}
