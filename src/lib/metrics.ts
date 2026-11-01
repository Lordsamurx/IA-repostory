import type { DataState } from '../data/seed';
import { dayDiff } from './utils';

const DAY = 86_400_000;

export function inRange(iso: string, days: number) {
  return Date.now() - new Date(iso).getTime() <= days * DAY;
}

/** Série diária dos últimos N dias (inclui hoje), com rótulo dd/mm */
export function dailySeries(dates: string[], days: number) {
  const buckets = new Map<number, number>();
  for (const d of dates) {
    const diff = -dayDiff(d);
    if (diff >= 0 && diff < days) buckets.set(diff, (buckets.get(diff) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_, i) => {
    const offset = days - 1 - i;
    const date = new Date(Date.now() - offset * DAY);
    return {
      label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      value: buckets.get(offset) ?? 0,
    };
  });
}

/** Tempo médio (min) entre a mensagem do lead e a primeira resposta (humano ou IA). */
export function responseTimes(s: Pick<DataState, 'messages'>, days: number) {
  const byConv = new Map<string, typeof s.messages>();
  for (const m of s.messages) {
    if (m.kind === 'note' || m.kind === 'system' || !inRange(m.createdAt, days)) continue;
    const arr = byConv.get(m.conversationId);
    if (arr) arr.push(m);
    else byConv.set(m.conversationId, [m]);
  }
  const all: number[] = [];
  const byAuthor = new Map<string, number[]>();
  for (const msgs of byConv.values()) {
    let waitingSince: string | null = null;
    for (const m of msgs) {
      if (m.direction === 'in') waitingSince ??= m.createdAt;
      else if (waitingSince && m.author !== 'followup') {
        const min = (new Date(m.createdAt).getTime() - new Date(waitingSince).getTime()) / 60_000;
        all.push(min);
        const arr = byAuthor.get(m.author) ?? [];
        arr.push(min);
        byAuthor.set(m.author, arr);
        waitingSince = null;
      }
    }
  }
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return { avg: avg(all), count: all.length, byAuthor: new Map([...byAuthor].map(([k, v]) => [k, avg(v)])) };
}

export function funnel(s: Pick<DataState, 'deals' | 'pipelines'>, pipelineId: string, days: number) {
  const p = s.pipelines.find((x) => x.id === pipelineId);
  if (!p) return [];
  const deals = s.deals.filter((d) => d.pipelineId === p.id && inRange(d.createdAt, days));
  // Quantos negócios chegaram pelo menos até cada etapa (ganhos contam como última etapa)
  const order = new Map(p.stages.map((st, i) => [st.id, i]));
  return p.stages.map((st, i) => {
    const reached = deals.filter((d) => (d.status === 'ganho' ? p.stages.length - 1 : (order.get(d.stageId) ?? 0)) >= i).length;
    return { id: st.id, name: st.name, color: st.color, value: reached };
  });
}
