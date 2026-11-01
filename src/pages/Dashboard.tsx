import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Bot, CheckSquare, Clock, Hourglass, MessagesSquare, UserPlus } from 'lucide-react';
import { useMe, useStore } from '../store/useStore';
import { Avatar, Card, PageHeader, StatTile } from '../components/ui';
import { ChartCard, HBarChart, TrendChart } from '../components/charts';
import { dailySeries, funnel, inRange, responseTimes } from '../lib/metrics';
import { chatTime, dayDiff, duration, firstName, money, timeHM } from '../lib/utils';

export default function Dashboard() {
  const me = useMe();
  const s = useStore();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const leadsToday = s.contacts.filter((c) => dayDiff(c.createdAt) === 0).length;
    const leadsYesterday = s.contacts.filter((c) => dayDiff(c.createdAt) === -1).length;
    const queue = s.conversations.filter((c) => c.status === 'aguardando').length;
    const active = s.conversations.filter((c) => c.status === 'em_atendimento').length;
    const ai = s.conversations.filter((c) => c.aiEnabled && c.status !== 'finalizado').length;
    const rt = responseTimes(s, 7);
    const late = s.tasks.filter((t) => !t.done && new Date(t.dueAt) < new Date()).length;
    const wonMonth = s.deals.filter((d) => d.status === 'ganho' && inRange(d.updatedAt, 30));
    return { leadsToday, leadsYesterday, queue, active, ai, rt, late, wonMonth };
  }, [s]);

  const leadsSeries = useMemo(() => dailySeries(s.contacts.map((c) => c.createdAt), 14), [s.contacts]);
  const funnelData = useMemo(() => funnel(s, s.pipelines[0]?.id ?? '', 90), [s]);
  const byAgent = useMemo(
    () =>
      s.users
        .map((u) => ({ name: u.name, value: s.conversations.filter((c) => c.assigneeId === u.id && c.status !== 'finalizado').length }))
        .sort((a, b) => b.value - a.value),
    [s.users, s.conversations],
  );

  const queue = s.conversations
    .filter((c) => c.status === 'aguardando')
    .sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt))
    .slice(0, 5);
  const myTasks = s.tasks
    .filter((t) => !t.done && t.assigneeId === me?.id && dayDiff(t.dueAt) <= 0)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 5);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const delta = stats.leadsToday - stats.leadsYesterday;

  return (
    <div>
      <PageHeader title={`${greet}, ${firstName(me?.name ?? '')} 👋`} subtitle="Resumo do atendimento e das vendas em tempo real" />
      <div className="space-y-5 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Novos leads hoje" icon={<UserPlus />} value={stats.leadsToday} hint={`${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} vs. ontem`} />
          <StatTile label="Na fila" icon={<Hourglass />} value={stats.queue} hint="Aguardando atendente" />
          <StatTile label="Em atendimento" icon={<MessagesSquare />} value={stats.active} hint="Com a equipe agora" />
          <StatTile label="Com a IA" icon={<Bot />} value={stats.ai} hint="Respondidas pelos agentes" />
          <StatTile label="1ª resposta (7 dias)" icon={<Clock />} value={stats.rt.count ? duration(stats.rt.avg) : '—'} hint={`${stats.rt.count} respostas medidas`} />
          <StatTile label="Vendas (30 dias)" icon={<CheckSquare />} value={money(stats.wonMonth.reduce((a, d) => a + d.value, 0))} hint={`${stats.wonMonth.length} negócios ganhos`} />
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <ChartCard title="Novos leads por dia" subtitle="Últimos 14 dias" className="xl:col-span-2">
            <TrendChart data={leadsSeries} />
          </ChartCard>
          <ChartCard title="Conversas abertas por atendente" subtitle="Distribuição da carga agora">
            <HBarChart data={byAgent} />
          </ChartCard>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <ChartCard title={`Funil — ${s.pipelines[0]?.name ?? ''}`} subtitle="Negócios que chegaram a cada etapa (90 dias)">
            <HBarChart data={funnelData} colorByItem />
          </ChartCard>

          <Card>
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-[14px] font-semibold">Fila de espera</h3>
              <Link to="/inbox" className="text-[12.5px] font-medium text-brand-600 hover:underline">
                Abrir Inbox
              </Link>
            </div>
            {queue.length === 0 && <p className="px-5 pb-5 text-[13px] text-ink-3">Ninguém esperando. 🎉</p>}
            {queue.map((c) => {
              const ct = s.contacts.find((x) => x.id === c.contactId);
              const waitMin = (Date.now() - new Date(c.lastMessageAt).getTime()) / 60000;
              return (
                <button key={c.id} onClick={() => navigate(`/inbox/${c.id}`)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-canvas">
                  <Avatar name={ct?.name ?? '?'} color={ct?.color} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{ct?.name}</span>
                    <span className="text-[12px] text-ink-3">{ct?.source}</span>
                  </span>
                  <span className={waitMin > 15 ? 'flex items-center gap-1 text-[12px] font-medium text-critical' : 'text-[12px] text-ink-3'}>
                    {waitMin > 15 && <AlertTriangle className="h-3.5 w-3.5" />}
                    {duration(waitMin)}
                  </span>
                </button>
              );
            })}
          </Card>

          <Card>
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-[14px] font-semibold">Minhas tarefas de hoje</h3>
              <Link to="/tarefas" className="text-[12.5px] font-medium text-brand-600 hover:underline">
                Ver todas
              </Link>
            </div>
            {myTasks.length === 0 && <p className="px-5 pb-5 text-[13px] text-ink-3">Sem tarefas para hoje.</p>}
            {myTasks.map((t) => {
              const late = new Date(t.dueAt) < new Date();
              const ct = s.contacts.find((x) => x.id === t.contactId);
              return (
                <label key={t.id} className="flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-canvas">
                  <input type="checkbox" className="accent-[var(--brand)]" onChange={() => s.update('tasks', t.id, { done: true })} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">{t.title}</span>
                    <span className="text-[12px] text-ink-3">{ct?.name}</span>
                  </span>
                  <span className={late ? 'text-[12px] font-medium text-critical' : 'text-[12px] text-ink-3'}>{late ? `Atrasada · ${chatTime(t.dueAt)}` : timeHM(t.dueAt)}</span>
                </label>
              );
            })}
          </Card>
        </div>
      </div>
    </div>
  );
}
