/**
 * Gráficos seguindo a skill dataviz:
 * marcas finas, cantos de 4px na ponta do dado, grade sólida e discreta,
 * uma cor por série (slot 1), rampa ordinal para etapas, tooltip em todo gráfico.
 */
import type { ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from './ui';

export const SERIES_1 = '#2a78d6';
const GRID = '#eef1f4';
const AXIS = { fontSize: 11.5, fill: '#8592a0' };

export function ChartCard({ title, subtitle, children, action, className }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h3 className="text-[14px] font-semibold">{title}</h3>
          {subtitle && <p className="text-[12px] text-ink-3">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="px-3 pt-2 pb-4">{children}</div>
    </Card>
  );
}

function TooltipBox({ active, payload, label, format }: { active?: boolean; payload?: { value: number; payload: { label?: string; name?: string } }[]; label?: string; format?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop">
      <div className="text-ink-3">{label ?? p.payload.name ?? p.payload.label}</div>
      <div className="font-semibold text-ink tabular-nums">{format ? format(p.value) : p.value}</div>
    </div>
  );
}

export function TrendChart({ data, height = 220, format }: { data: { label: string; value: number }[]; height?: number; format?: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_1} stopOpacity={0.18} />
            <stop offset="100%" stopColor={SERIES_1} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <Tooltip content={<TooltipBox format={format} />} cursor={{ stroke: '#c5ccd3', strokeWidth: 1 }} />
        <Area type="monotone" dataKey="value" stroke={SERIES_1} strokeWidth={2} fill="url(#trendFill)" activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontais ranqueadas — uma cor só (categorias nominais) ou cor por item (rampa ordinal). */
export function HBarChart({
  data,
  format,
  height,
  colorByItem,
}: {
  data: { name: string; value: number; color?: string }[];
  format?: (v: number) => string;
  height?: number;
  colorByItem?: boolean;
}) {
  const h = height ?? Math.max(120, data.length * 38 + 16);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }} barCategoryGap={10}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: '#4f5d69' }} tickLine={false} axisLine={false} width={128} />
        <Tooltip content={<TooltipBox format={format} />} cursor={{ fill: 'rgba(42,120,214,0.06)' }} />
        <Bar
          dataKey="value"
          radius={[0, 4, 4, 0]}
          maxBarSize={18}
          label={{ position: 'right', fontSize: 11.5, fill: '#4f5d69', formatter: (v: unknown) => (format ? format(Number(v)) : String(v)) }}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={colorByItem && d.color ? d.color : SERIES_1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VBarChart({ data, format, height = 220 }: { data: { label: string; value: number }[]; format?: (v: number) => string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <Tooltip content={<TooltipBox format={format} />} cursor={{ fill: 'rgba(42,120,214,0.06)' }} />
        <Bar dataKey="value" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}
