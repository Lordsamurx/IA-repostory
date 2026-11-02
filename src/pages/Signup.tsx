import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Button, Field, Input } from '../components/ui';
import { isSupabaseMode } from '../lib/supabase';
import { AuthShell } from './Login';

export default function Signup() {
  const signupLocal = useStore((s) => s.signupLocal);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '' });
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');

  // No modo Supabase o administrador é criado pelo instalador (SETUP-KIT/install.sh)
  if (isSupabaseMode) return <Navigate to="/login" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirm) return setConfirm(true);
    try {
      await signupLocal(form);
      navigate('/onboarding');
    } catch (err) {
      setConfirm(false);
      setError(err instanceof Error ? err.message : 'Não foi possível criar a conta.');
    }
  };

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold">Criar sua empresa</h1>
      <p className="mt-1 text-sm text-ink-3">Comece com o CRM vazio e configure do seu jeito.</p>
      <form onSubmit={submit} className="mt-7 space-y-4">
        <Field label="Seu nome">
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Maria Silva" />
        </Field>
        <Field label="Nome da empresa">
          <Input required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Minha Empresa" />
        </Field>
        <Field label="E-mail de login">
          <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Senha" hint="Mínimo de 6 caracteres">
          <Input type="password" minLength={6} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {confirm && (
          <p className="rounded-lg bg-[color-mix(in_oklab,var(--warning)_16%,var(--surface))] px-3 py-2 text-[13px] text-[color-mix(in_oklab,var(--warning)_78%,var(--ink))]">
            Isso substitui os dados de demonstração salvos neste navegador. Clique de novo para confirmar.
          </p>
        )}
        {error && <p className="rounded-lg bg-[color-mix(in_oklab,var(--critical)_14%,var(--surface))] px-3 py-2 text-[13px] text-[color-mix(in_oklab,var(--critical)_80%,var(--ink))]">{error}</p>}
        <Button type="submit" size="lg" className="w-full">
          {confirm ? 'Confirmar e criar' : 'Criar conta'}
        </Button>
      </form>
      <p className="mt-5 text-center text-[13px] text-ink-3">
        Já tem conta?{' '}
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}
