import { useMemo, useState } from 'react';
import { Download, Megaphone, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Avatar, Badge, Button, Card, Field, Input, Modal, PageHeader, Select, StatTile, Tabs } from '../components/ui';
import { ChartCard, HBarChart, TrendChart, VBarChart } from '../components/charts';
import { dailySeries, funnel, inRange, responseTimes } from '../lib/metrics';
import { downloadCsv, duration, money, number, pct, uid } from '../lib/utils';
import { LEAD_SOURCES, type Campaign } from '../types';

type Range = '7' | '30' | '90';

export default function Analises() {
  const s = useStore();
  const [range, setRange] = useState<Range>('30');
  const [pipelineId, setPipelineId] = useState(s.pipelines[0]?.id ?? '');
  const [tab, setTab] = useState<'funil' | 'equipe' | 'meta'>('funil');
  const days = Number(range);

  const data = useMemo(() => {
    const leads = s.contacts.filter((c) => inRange(c.createdAt, days));
    const closed = s.deals.filter((d) => d.status !== 'aberto' && inRange(d.updatedAt, days));
    const won = closed.filter((d) => d.status === 'ganho');
    const revenue = won.reduce((a, d) => a + d.value, 0);
    const rt = responseTimes(s, days);
    const bySource = LEAD_SOURCES.map((src) => ({ name: src, value: leads.filter((c) => c.source === src).length }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
    const lostReasons = Object.entries(
      closed.filter((d) => d.status === 'perdido').reduce<Record<string, number>>((acc, d) => ((acc[d.lostReason ?? 'Não informado'] = (acc[d.lostReason ?? 'Não informado'] ?? 0) + 1), acc), {}),
    )
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const revenueSeries = dailySeries(won.map((d) => d.updatedAt), Math.min(days, 30)).map((p, i, arr) => {
      const offset = arr.length - 1 - i;
      const value = won.filter((d) => Math.round((Date.now() - new Date(d.updatedAt).getTime()) / 86_400_000) === offset).reduce((a, d) => a + d.value, 0);
      return { label: p.label, value };
    });
    return { leads, closed, won, revenue, rt, bySource, lostReasons, revenueSeries };
  }, [s, days]);

  const funnelData = useMemo(() => funnel(s, pipelineId, days), [s, pipelineId, days]);
  const team = useMemo(() => {
    return s.users.map((u) => {
      const convs = s.conversations.filter((c) => c.assigneeId === u.id && inRange(c.lastMessageAt, days));
      const sent = s.messages.filter((m) => m.author === u.id && m.kind !== 'note' && inRange(m.createdAt, days)).length;
      const won = s.deals.filter((d) => d.ownerId === u.id && d.status === 'ganho' && inRange(d.updatedAt, days));
      return { user: u, convs: convs.length, finished: convs.filter((c) => c.status === 'finalizado').length, sent, won: won.length, revenue: won.reduce((a, d) => a + d.value, 0), rt: data.rt.byAuthor.get(u.id) };
    });
  }, [s, days, data.rt]);

  const exportReport = () => {
    downloadCsv(`relatorio-${days}d.csv`, [
      ['Métrica', 'Valor'],
      ['Período (dias)', days],
      ['Novos leads', data.leads.length],
      ['Negócios ganhos', data.won.length],
      ['Receita', data.revenue],
      ['Taxa de conversão', data.closed.length ? (data.won.length / data.closed.length).toFixed(3) : 0],
      ['Tempo médio de 1ª resposta (min)', data.rt.avg.toFixed(1)],
      [],
      ['Origem', 'Leads'],
      ...data.bySource.map((x) => [x.name, x.value]),
      [],
      ['Atendente', 'Conversas', 'Finalizadas', 'Mensagens', 'Vendas', 'Receita'],
      ...team.map((t) => [t.user.name, t.convs, t.finished, t.sent, t.won, t.revenue]),
    ]);
  };

  return (
    <div>
      <PageHeader
        title="Análises"
        subtitle="Desempenho do funil, da equipe e das campanhas"
        actions={
          <>
            <div className="flex rounded-lg bg-canvas p-1 text-[13px]">
              {(['7', '30', '90'] as Range[]).map((r) => (
                <button key={r} onClick={() => setRange(r)} className={range === r ? 'rounded-md bg-surface px-3 py-1 font-medium shadow-card' : 'px-3 py-1 text-ink-3'}>
                  {r} dias
                </button>
              ))}
            </div>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportReport}>
              Exportar
            </Button>
          </>
        }
      />
      <div className="space-y-5 p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatTile label="Novos leads" value={number(data.leads.length)} />
          <StatTile label="Taxa de conversão" value={data.closed.length ? pct(data.won.length / data.closed.length) : '—'} hint={`${data.won.length} ganhos de ${data.closed.length} encerrados`} />
          <StatTile label="Receita ganha" value={money(data.revenue)} />
          <StatTile label="Ticket médio" value={data.won.length ? money(data.revenue / data.won.length) : '—'} />
          <StatTile label="Tempo de 1ª resposta" value={data.rt.count ? duration(data.rt.avg) : '—'} hint="Média entre humanos e IA" />
        </div>

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'funil', label: 'Funil e origens' },
            { value: 'equipe', label: 'Equipe' },
            { value: 'meta', label: 'Meta Ads' },
          ]}
        />

        {tab === 'funil' && (
          <>
            <div className="grid gap-5 xl:grid-cols-2">
              <ChartCard
                title="Funil de conversão"
                subtitle="Negócios criados no período que alcançaram cada etapa"
                action={
                  <Select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} className="h-8 w-48 text-[12.5px]" aria-label="Funil">
                    {s.pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                }
              >
                <HBarChart data={funnelData} colorByItem />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-2 text-[12px] text-ink-3">
                  {funnelData.slice(1).map((st, i) => (
                    <span key={st.id}>
                      {funnelData[i]!.name} → {st.name}: <b className="text-ink-2">{funnelData[i]!.value ? pct(st.value / funnelData[i]!.value, 0) : '—'}</b>
                    </span>
                  ))}
                </div>
              </ChartCard>
              <ChartCard title="Origem dos leads" subtitle="De onde vieram os contatos novos">
                <HBarChart data={data.bySource} />
              </ChartCard>
            </div>
            <div className="grid gap-5 xl:grid-cols-3">
              <ChartCard title="Novos leads por dia" className="xl:col-span-2">
                <TrendChart data={dailySeries(data.leads.map((c) => c.createdAt), days)} />
              </ChartCard>
              <ChartCard title="Motivos de perda">
                {data.lostReasons.length ? <HBarChart data={data.lostReasons} /> : <p className="px-2 py-8 text-center text-[13px] text-ink-3">Nenhum negócio perdido no período.</p>}
              </ChartCard>
            </div>
            <ChartCard title="Receita ganha por dia" subtitle={`Últimos ${Math.min(days, 30)} dias`}>
              <VBarChart data={data.revenueSeries} format={money} />
            </ChartCard>
          </>
        )}

        {tab === 'equipe' && (
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-canvas/60 text-[12px] text-ink-3">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Atendente</th>
                  <th className="px-4 py-2.5 text-right font-medium">Conversas</th>
                  <th className="px-4 py-2.5 text-right font-medium">Finalizadas</th>
                  <th className="px-4 py-2.5 text-right font-medium">Mensagens enviadas</th>
                  <th className="px-4 py-2.5 text-right font-medium">1ª resposta</th>
                  <th className="px-4 py-2.5 text-right font-medium">Vendas</th>
                  <th className="px-4 py-2.5 text-right font-medium">Receita</th>
                </tr>
              </thead>
              <tbody>
                {team
                  .sort((a, b) => b.revenue - a.revenue)
                  .map((t) => (
                    <tr key={t.user.id} className="border-b border-line/70 last:border-0">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={t.user.name} color={t.user.color} size={28} presence={t.user.presence} />
                          <span className="font-medium">{t.user.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.convs}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.finished}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.sent}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.rt !== undefined ? duration(t.rt) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.won}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{money(t.revenue)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        )}

        {tab === 'meta' && <MetaAds />}
      </div>
    </div>
  );
}

function MetaAds() {
  const campaigns = useStore((s) => s.campaigns);
  const metaLeads = useStore((s) => s.contacts.filter((c) => c.source === 'Meta Ads').length);
  const { update, remove, toast } = useStore.getState();
  const [creating, setCreating] = useState(false);

  const total = campaigns.reduce(
    (a, c) => ({ spend: a.spend + c.spend, leads: a.leads + c.leads, sales: a.sales + c.sales, clicks: a.clicks + c.clicks, impressions: a.impressions + c.impressions }),
    { spend: 0, leads: 0, sales: 0, clicks: 0, impressions: 0 },
  );
  const cplData = campaigns
    .filter((c) => c.leads)
    .map((c) => ({ name: c.name.replace(/^\[[^\]]+\]\s*/, ''), value: Math.round((c.spend / c.leads) * 100) / 100 }))
    .sort((a, b) => a.value - b.value);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Investimento" value={money(total.spend)} icon={<Megaphone />} />
        <StatTile label="Leads (Meta)" value={number(total.leads)} hint={`${metaLeads} contatos com origem Meta Ads no CRM`} />
        <StatTile label="Custo por lead" value={total.leads ? money(total.spend / total.leads) : '—'} />
        <StatTile label="Vendas atribuídas" value={number(total.sales)} />
        <StatTile label="Custo por venda" value={total.sales ? money(total.spend / total.sales) : '—'} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div>
              <h3 className="text-[14px] font-semibold">Campanhas</h3>
              <p className="text-[12px] text-ink-3">Dados importados do Gerenciador de Anúncios</p>
            </div>
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              Adicionar campanha
            </Button>
          </div>
          <table className="w-full text-left text-[13px]">
            <thead className="border-y border-line bg-canvas/60 text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-2.5 font-medium">Campanha</th>
                <th className="px-3 py-2.5 text-right font-medium">Gasto</th>
                <th className="px-3 py-2.5 text-right font-medium">CTR</th>
                <th className="px-3 py-2.5 text-right font-medium">Leads</th>
                <th className="px-3 py-2.5 text-right font-medium">CPL</th>
                <th className="px-3 py-2.5 text-right font-medium">Vendas</th>
                <th className="px-3 py-2.5 text-right font-medium">Conv.</th>
                <th className="w-20 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.name}</div>
                    <Badge tone={c.status === 'ativa' ? 'good' : 'neutral'}>{c.status === 'ativa' ? '● Ativa' : '○ Pausada'}</Badge>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{money(c.spend)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{c.impressions ? pct(c.clicks / c.impressions, 2) : '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{c.leads}</td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums">{c.leads ? money(c.spend / c.leads) : '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{c.sales}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{c.leads ? pct(c.sales / c.leads) : '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end">
                      <button
                        aria-label={c.status === 'ativa' ? 'Pausar' : 'Ativar'}
                        className="rounded p-1.5 text-ink-3 hover:bg-canvas"
                        onClick={() => update('campaigns', c.id, { status: c.status === 'ativa' ? 'pausada' : 'ativa' })}
                      >
                        {c.status === 'ativa' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <button aria-label="Remover" className="rounded p-1.5 text-ink-3 hover:bg-canvas hover:text-critical" onClick={() => (remove('campaigns', c.id), toast('Campanha removida'))}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-ink-3">
                    Nenhuma campanha cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <ChartCard title="Custo por lead" subtitle="Menor é melhor">
          <HBarChart data={cplData} format={money} />
        </ChartCard>
      </div>
      <CampaignModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CampaignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { add, toast } = useStore.getState();
  const blank = (): Campaign => ({ id: uid('cmp-'), name: '', status: 'ativa', spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0 });
  const [form, setForm] = useState<Campaign>(blank());
  const num = (k: keyof Campaign) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: Number(e.target.value) });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar campanha"
      footer={
        <Button
          disabled={!form.name.trim()}
          onClick={() => {
            add('campaigns', form);
            toast('Campanha adicionada');
            setForm(blank());
            onClose();
          }}
        >
          Salvar
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da campanha" className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Valor gasto (R$)">
          <Input type="number" min={0} value={form.spend} onChange={num('spend')} />
        </Field>
        <Field label="Impressões">
          <Input type="number" min={0} value={form.impressions} onChange={num('impressions')} />
        </Field>
        <Field label="Cliques">
          <Input type="number" min={0} value={form.clicks} onChange={num('clicks')} />
        </Field>
        <Field label="Leads">
          <Input type="number" min={0} value={form.leads} onChange={num('leads')} />
        </Field>
        <Field label="Vendas">
          <Input type="number" min={0} value={form.sales} onChange={num('sales')} />
        </Field>
      </div>
    </Modal>
  );
}
