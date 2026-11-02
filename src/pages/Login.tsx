import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Bot, CheckCheck, Columns3, Loader2, MessageSquare } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Button, Field, Input } from '../components/ui';
import { isSupabaseMode, supabase } from '../lib/supabase';

export function AuthShell({ children }: { children: React.ReactNode }) {
  const settings = useStore((s) => s.settings);
  return (
    <div className="flex min-h-full">
      <div className="relative hidden w-[46%] overflow-hidden bg-sidebar p-10 text-white lg:flex lg:flex-col">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-brand-400/15 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 font-bold">{settings.logoText.slice(0, 1)}</div>
          <span className="text-lg font-semibold">{settings.logoText}</span>
        </div>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl leading-tight font-semibold">Todos os seus atendimentos de WhatsApp em um só lugar.</h2>
          <p className="mt-3 text-[15px] text-[#9fb3c0]">Inbox compartilhada, funil de vendas, agentes de IA e follow-ups automáticos para não perder nenhum lead.</p>

          <div className="mt-8 space-y-2.5 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="max-w-[80%] rounded-xl rounded-tl-sm bg-white px-3 py-2 text-[13px] text-ink">Oi! Vi o anúncio, quanto custa o clareamento? 😊</div>
            <div className="ml-auto max-w-[80%] rounded-xl rounded-tr-sm bg-bubble-out px-3 py-2 text-[13px] text-ink">
              Olá! Sou a assistente virtual. O clareamento a laser sai R$ 890 e parcela em até 10x. Quer agendar a avaliação gratuita?
              <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-ink-3">
                <Bot className="h-3 w-3" /> IA · 14:02 <CheckCheck className="h-3 w-3 text-[#34b7f1]" />
              </span>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-3 text-[12px] text-[#9fb3c0]">
            <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-brand-300" /> Inbox</div>
            <div className="flex items-center gap-2"><Columns3 className="h-4 w-4 text-brand-300" /> Funis</div>
            <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-brand-300" /> Agentes de IA</div>
          </div>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center bg-surface p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

export default function Login() {
  const sessionUserId = useStore((s) => s.sessionUserId);
  const loginLocal = useStore((s) => s.loginLocal);
  const hasDemo = useStore((s) => s.users.some((u) => u.email === 'admin@demo.com'));
  const navigate = useNavigate();
  const [email, setEmail] = useState(hasDemo && !isSupabaseMode ? 'admin@demo.com' : '');
  const [password, setPassword] = useState(hasDemo && !isSupabaseMode ? 'demo123' : '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (sessionUserId) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (supabase) {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (err) setError(err.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : err.message);
      // o carregamento dos dados acontece no App (onAuthStateChange)
      return;
    }
    try {
      const ok = await loginLocal(email, password);
      setLoading(false);
      if (ok) navigate('/');
      else setError('E-mail ou senha incorretos.');
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    }
  };

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <p className="mt-1 text-sm text-ink-3">Acesse sua conta para começar os atendimentos.</p>
      <form onSubmit={submit} className="mt-7 space-y-4">
        <Field label="E-mail">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" />
        </Field>
        <Field label="Senha">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        {error && <p className="rounded-lg bg-[color-mix(in_oklab,var(--critical)_14%,var(--surface))] px-3 py-2 text-[13px] text-[color-mix(in_oklab,var(--critical)_80%,var(--ink))]">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
        </Button>
      </form>

      {!isSupabaseMode && (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-canvas p-3.5 text-[13px] text-ink-2">
          <p className="font-medium text-ink">Modo local (demonstração)</p>
          <p className="mt-1">
            Os dados ficam salvos neste navegador. Use <b>admin@demo.com</b> / <b>demo123</b> ou{' '}
            <Link to="/cadastro" className="font-medium text-brand-600 hover:underline">
              crie sua empresa do zero
            </Link>
            .
          </p>
        </div>
      )}
    </AuthShell>
  );
}
