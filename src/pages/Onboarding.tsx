import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Briefcase, Building2, Check, GraduationCap, HeartPulse, Megaphone, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Button, Field, Input, Select } from '../components/ui';
import { cn, rampFor, SWATCHES, uid } from '../lib/utils';
import type { Pipeline } from '../types';

const BUSINESS = [
  { id: 'Clínica / Saúde', icon: HeartPulse, stages: ['Novo lead', 'Avaliação agendada', 'Avaliação realizada', 'Orçamento enviado', 'Fechado'] },
  { id: 'Varejo / E-commerce', icon: ShoppingBag, stages: ['Novo lead', 'Interessado', 'Orçamento', 'Pagamento pendente', 'Venda concluída'] },
  { id: 'Serviços', icon: Briefcase, stages: ['Novo lead', 'Qualificado', 'Proposta enviada', 'Negociação', 'Fechamento'] },
  { id: 'Imobiliária', icon: Building2, stages: ['Novo lead', 'Visita agendada', 'Visita realizada', 'Proposta', 'Contrato'] },
  { id: 'Educação / Cursos', icon: GraduationCap, stages: ['Novo lead', 'Aula experimental', 'Matrícula pendente', 'Matriculado'] },
  { id: 'Agência / Infoprodutos', icon: Megaphone, stages: ['Novo lead', 'Diagnóstico', 'Proposta', 'Negociação', 'Fechado'] },
];

const TIMEZONES = [
  ['America/Sao_Paulo', 'Brasília (GMT-3)'],
  ['America/Manaus', 'Manaus (GMT-4)'],
  ['America/Cuiaba', 'Cuiabá (GMT-4)'],
  ['America/Rio_Branco', 'Rio Branco (GMT-5)'],
  ['America/Noronha', 'Fernando de Noronha (GMT-2)'],
  ['Europe/Lisbon', 'Lisboa'],
];

const STEPS = ['Seu negócio', 'Fuso e horário', 'Funil de vendas', 'Sua marca'];

export default function Onboarding() {
  const sessionUserId = useStore((s) => s.sessionUserId);
  const settings = useStore((s) => s.settings);
  const pipelines = useStore((s) => s.pipelines);
  const setSettings = useStore((s) => s.setSettings);
  const replaceAll = useStore((s) => s.replaceAll);
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [business, setBusiness] = useState(settings.businessType);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [hours, setHours] = useState(settings.businessHours);
  const [stages, setStages] = useState<string[]>(pipelines[0]?.stages.map((s) => s.name) ?? BUSINESS[2]!.stages);
  const [brand, setBrand] = useState(settings.brandColor);
  const [logoText, setLogoText] = useState(settings.logoText);

  if (!sessionUserId) return <Navigate to="/login" replace />;
  if (settings.onboarded) return <Navigate to="/" replace />;

  const chooseBusiness = (id: string) => {
    setBusiness(id);
    setStages(BUSINESS.find((b) => b.id === id)!.stages);
  };

  const finish = () => {
    const clean = stages.map((s) => s.trim()).filter(Boolean);
    const pipeline: Pipeline = {
      id: pipelines[0]?.id ?? uid('pip-'),
      name: 'Funil de vendas',
      stages: clean.map((name, i) => ({
        id: pipelines[0]?.stages[i]?.id ?? uid('stg-'),
        name,
        color: rampFor(i, clean.length),
        probability: Math.round(((i + 1) / clean.length) * 100),
      })),
    };
    replaceAll({ pipelines: [pipeline, ...pipelines.slice(1)] });
    setSettings({ businessType: business, timezone, businessHours: hours, brandColor: brand, logoText, onboarded: true });
    navigate('/');
  };

  return (
    <div className="flex min-h-full items-start justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">Vamos configurar o seu CRM</h1>
          <p className="mt-1 text-sm text-ink-3">Leva 1 minuto. Você pode mudar tudo depois em Configurações.</p>
        </div>

        <ol className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold',
                  i < step ? 'bg-brand-500 text-white' : i === step ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-500' : 'bg-surface text-ink-3 ring-1 ring-line',
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn('hidden text-[13px] sm:block', i === step ? 'font-medium text-ink' : 'text-ink-3')}>{label}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line" />}
            </li>
          ))}
        </ol>

        <div className="animate-in rounded-2xl border border-line bg-surface p-6 shadow-card" key={step}>
          {step === 0 && (
            <>
              <h2 className="font-semibold">Qual é o tipo do seu negócio?</h2>
              <p className="mb-4 text-[13px] text-ink-3">Usamos isso para sugerir as etapas do funil.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {BUSINESS.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => chooseBusiness(b.id)}
                    className={cn(
                      'flex flex-col items-start gap-2 rounded-xl border p-4 text-left text-[13px] font-medium transition',
                      business === b.id ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-line hover:border-brand-300',
                    )}
                  >
                    <b.icon className={cn('h-5 w-5', business === b.id ? 'text-brand-600' : 'text-ink-3')} />
                    {b.id}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-semibold">Fuso horário e horário de atendimento</h2>
              <Field label="Fuso horário">
                <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {TIMEZONES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Abre às">
                  <Input type="time" value={hours.start} onChange={(e) => setHours({ ...hours, start: e.target.value })} />
                </Field>
                <Field label="Fecha às">
                  <Input type="time" value={hours.end} onChange={(e) => setHours({ ...hours, end: e.target.value })} />
                </Field>
              </div>
              <Field label="Dias de atendimento">
                <div className="flex flex-wrap gap-1.5">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => {
                    const on = hours.days.includes(i as 0);
                    return (
                      <button
                        type="button"
                        key={d}
                        onClick={() =>
                          setHours({ ...hours, days: on ? hours.days.filter((x) => x !== i) : ([...hours.days, i].sort() as typeof hours.days) })
                        }
                        className={cn('h-9 w-12 rounded-lg border text-[13px]', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-line text-ink-2')}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          )}

          {step === 2 && (
            <>
              <h2 className="font-semibold">Etapas do seu funil (Kanban)</h2>
              <p className="mb-4 text-[13px] text-ink-3">Sugestão para “{business}”. Renomeie, remova ou adicione etapas.</p>
              <div className="space-y-2">
                {stages.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="h-8 w-1.5 rounded-full" style={{ background: rampFor(i, stages.length) }} />
                    <Input value={s} onChange={(e) => setStages(stages.map((x, j) => (j === i ? e.target.value : x)))} />
                    <button
                      aria-label="Remover etapa"
                      disabled={stages.length <= 2}
                      onClick={() => setStages(stages.filter((_, j) => j !== i))}
                      className="rounded-lg p-2 text-ink-3 hover:bg-canvas hover:text-critical disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="mt-2" icon={<Plus className="h-4 w-4" />} disabled={stages.length >= 8} onClick={() => setStages([...stages, 'Nova etapa'])}>
                Adicionar etapa
              </Button>
            </>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-semibold">Deixe com a sua cara</h2>
              <Field label="Nome exibido no menu">
                <Input value={logoText} onChange={(e) => setLogoText(e.target.value)} />
              </Field>
              <Field label="Cor principal">
                <div className="flex flex-wrap items-center gap-2">
                  {SWATCHES.slice(0, 8).map((c) => (
                    <button
                      key={c}
                      aria-label={`Cor ${c}`}
                      onClick={() => setBrand(c)}
                      className={cn('h-8 w-8 rounded-full ring-offset-2', brand === c && 'ring-2 ring-ink')}
                      style={{ background: c }}
                    />
                  ))}
                  <input type="color" value={brand} onChange={(e) => setBrand(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line" />
                </div>
              </Field>
              <div className="flex items-center gap-3 rounded-xl bg-sidebar p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-white" style={{ background: brand }}>
                  {logoText.slice(0, 1)}
                </div>
                <span className="font-semibold text-white">{logoText}</span>
                <span className="ml-auto rounded-lg px-3 py-1.5 text-[13px] font-medium text-white" style={{ background: brand }}>
                  Botão
                </span>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-between border-t border-line pt-4">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
              Voltar
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep(step + 1)}>Continuar</Button>
            ) : (
              <Button onClick={finish}>Concluir e entrar</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
