import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useStore } from './store/useStore';
import { applyBrand } from './lib/utils';
import { isSupabaseMode, supabase } from './lib/supabase';
import { loadRemote, startSync, stopSync } from './lib/sync';
import { startAutomation } from './lib/automation';
import AppLayout from './components/layout/AppLayout';
import { Toasts } from './components/ui';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Onboarding from './pages/Onboarding';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inbox = lazy(() => import('./pages/Inbox'));
const Disparos = lazy(() => import('./pages/Disparos'));
const Chatbot = lazy(() => import('./pages/Chatbot'));
const Arquivos = lazy(() => import('./pages/Arquivos'));
const Funis = lazy(() => import('./pages/Funis'));
const Contatos = lazy(() => import('./pages/Contatos'));
const Tarefas = lazy(() => import('./pages/Tarefas'));
const Produtos = lazy(() => import('./pages/Produtos'));
const Agentes = lazy(() => import('./pages/Agentes'));
const FollowUps = lazy(() => import('./pages/FollowUps'));
const Conhecimento = lazy(() => import('./pages/Conhecimento'));
const Conexoes = lazy(() => import('./pages/Conexoes'));
const Analises = lazy(() => import('./pages/Analises'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));

function FullLoader({ text = 'Carregando…' }: { text?: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-3">
      <Loader2 className="h-4 w-4 animate-spin" /> {text}
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const sessionUserId = useStore((s) => s.sessionUserId);
  const onboarded = useStore((s) => s.settings.onboarded);
  const hydrated = useStore((s) => s.hydrated);
  if (!sessionUserId) return <Navigate to="/login" replace />;
  if (!hydrated) return <FullLoader text="Carregando seus dados…" />;
  if (!onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export default function App() {
  const brand = useStore((s) => s.settings.brandColor);
  const companyName = useStore((s) => s.settings.companyName);
  const sessionUserId = useStore((s) => s.sessionUserId);
  const hydrated = useStore((s) => s.hydrated);
  const [booting, setBooting] = useState(isSupabaseMode);

  useEffect(() => applyBrand(brand), [brand]);
  useEffect(() => {
    document.title = `${companyName} · CRM`;
  }, [companyName]);

  // Modo Supabase: restaura a sessão e carrega os dados do banco
  useEffect(() => {
    if (!supabase) return;
    const boot = async (user: { id: string; email?: string } | null) => {
      if (!user) {
        stopSync();
        useStore.setState({ sessionUserId: null, hydrated: false });
        setBooting(false);
        return;
      }
      try {
        await loadRemote(user);
        startSync();
      } catch (e) {
        useStore.getState().toast(`Não foi possível carregar os dados: ${(e as Error).message}`, 'error');
        stopSync();
        useStore.setState({ sessionUserId: null, hydrated: false });
        await supabase?.auth.signOut();
      } finally {
        setBooting(false);
      }
    };
    void supabase.auth.getSession().then(({ data }) => boot(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && !useStore.getState().hydrated) void boot(session?.user ?? null);
      if (event === 'SIGNED_OUT') void boot(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (sessionUserId && hydrated) startAutomation();
  }, [sessionUserId, hydrated]);

  if (booting) return <FullLoader />;

  return (
    <>
      <Suspense fallback={<FullLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Signup />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route
            element={
              <Protected>
                <AppLayout />
              </Protected>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="inbox/:conversationId" element={<Inbox />} />
            <Route path="disparos" element={<Disparos />} />
            <Route path="chatbot" element={<Chatbot />} />
            <Route path="arquivos" element={<Arquivos />} />
            <Route path="funis" element={<Funis />} />
            <Route path="contatos" element={<Contatos />} />
            <Route path="tarefas" element={<Tarefas />} />
            <Route path="produtos" element={<Produtos />} />
            <Route path="agentes" element={<Agentes />} />
            <Route path="follow-ups" element={<FollowUps />} />
            <Route path="conhecimento" element={<Conhecimento />} />
            <Route path="conexoes" element={<Conexoes />} />
            <Route path="analises" element={<Analises />} />
            <Route path="configuracoes" element={<Configuracoes />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toasts />
    </>
  );
}
