import type { CustomField } from '../types';
import { Input, Select } from './ui';
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
  return (
    <Input
      className={cls}
      aria-label={field.name}
      type={field.type === 'numero' ? 'number' : field.type === 'data' ? 'date' : 'text'}
      defaultValue={value ?? ''}
      key={value ?? ''}
      onBlur={(e) => e.target.value !== (value ?? '') && onChange(e.target.value)}
    />
  );
}
