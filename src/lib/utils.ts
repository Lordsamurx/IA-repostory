import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toCsv } from './csv';

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

export const uid = (prefix = '') =>
  prefix + (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export const nowIso = () => new Date().toISOString();

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlShort = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const num = new Intl.NumberFormat('pt-BR');

export const money = (v: number) => brl.format(v || 0);
export const moneyShort = (v: number) => brlShort.format(v || 0);
export const number = (v: number) => num.format(v || 0);
export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits).replace('.', ',')}%`;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

export const onlyDigits = (s: string) => s.replace(/\D/g, '');

export function formatPhone(raw: string) {
  const d = onlyDigits(raw);
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return raw;
}

export function timeHM(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function dateBR(iso: string, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  return new Date(iso).toLocaleDateString('pt-BR', opts);
}

export function dateTimeBR(iso: string) {
  return `${dateBR(iso, { day: '2-digit', month: '2-digit' })} ${timeHM(iso)}`;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function dayDiff(iso: string, ref = new Date()) {
  return Math.round((startOfDay(new Date(iso)).getTime() - startOfDay(ref).getTime()) / 86_400_000);
}

/** Rótulo curto estilo lista de conversas: 14:32 · Ontem · seg · 12/03 */
export function chatTime(iso: string) {
  const diff = dayDiff(iso);
  if (diff === 0) return timeHM(iso);
  if (diff === -1) return 'Ontem';
  if (diff > -7) return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return dateBR(iso, { day: '2-digit', month: '2-digit' });
}

export function dayLabel(iso: string) {
  const diff = dayDiff(iso);
  if (diff === 0) return 'Hoje';
  if (diff === -1) return 'Ontem';
  return dateBR(iso, { weekday: 'long', day: '2-digit', month: 'long' });
}

export function relative(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} d`;
}

export function duration(minutes: number) {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}min` : `${h}h`;
}

/** Cores para avatares e etiquetas — usadas como identidade, sempre com texto ao lado. */
export const SWATCHES = [
  '#00a389',
  '#2a78d6',
  '#eb6834',
  '#6250d6',
  '#e87ba4',
  '#eda100',
  '#1baf7a',
  '#e34948',
  '#0e7490',
  '#7c5c3b',
];

export const pickColor = (seed: string) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SWATCHES[h % SWATCHES.length]!;
};

export function applyBrand(color: string) {
  document.documentElement.style.setProperty('--brand', color);
}

export function applyTheme(theme: 'light' | 'dark' | 'system' = 'light') {
  if (typeof document === 'undefined') return;
  const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}

/** Verifica se a janela de 24h da API Oficial do WhatsApp está aberta (última mensagem recebida < 24h). */
export function isWindowOpen(
  messages: readonly { conversationId: string; direction: 'in' | 'out'; createdAt: string }[],
  conversationId: string,
  now = Date.now(),
): boolean {
  let latestIn = 0;
  for (const m of messages) {
    if (m.conversationId === conversationId && m.direction === 'in') {
      const t = new Date(m.createdAt).getTime();
      if (t > latestIn) latestIn = t;
    }
  }
  return latestIn > 0 && now - latestIn < 24 * 60 * 60 * 1000;
}

export function fillTemplate(text: string, vars: Record<string, string | undefined>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? '');
}

export const firstName = (name: string) => name.split(' ')[0] ?? name;

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = toCsv(rows);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function parseCsv(text: string): string[][] {
  const sep = text.split('\n')[0]?.includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.map((r) => r.map((c) => c.replace(/^﻿/, '').trim()));
}

/** Rampa ordinal azul (skill dataviz): etapas do funil do mais claro ao mais escuro */
export const STAGE_RAMP = ['#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95'];
export const rampFor = (i: number, n: number) => STAGE_RAMP[Math.round((i / Math.max(1, n - 1)) * (STAGE_RAMP.length - 1))]!;

/** Nome da variável de um campo personalizado: "Data de nascimento" → data_de_nascimento */
export const fieldVar = (name: string) =>
  normalize(name)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
