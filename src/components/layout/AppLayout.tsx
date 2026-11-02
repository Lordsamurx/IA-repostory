import { Suspense, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  CheckSquare,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  FolderOpen,
  LayoutDashboard,
  Loader2,
  LogOut,
  Megaphone,
  Menu as MenuIcon,
  MessageSquare,
  Moon,
  Package,
  Plug,
  Repeat,
  Settings,
  Sun,
  Users,
  Workflow,
} from 'lucide-react';
import { useMe, useStore } from '../../store/useStore';
import { Avatar, Menu, MenuItem } from '../ui';
import { cn, relative } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { stopSync } from '../../lib/sync';
import type { Presence } from '../../types';

const NAV = [
  {
    section: 'Atendimento',
    items: [
      { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
      { to: '/inbox', label: 'Inbox', icon: MessageSquare, badge: 'inbox' as const },
      { to: '/disparos', label: 'Disparos', icon: Megaphone },
      { to: '/arquivos', label: 'Arquivos', icon: FolderOpen },
    ],
  },
  {
    section: 'CRM',
    items: [
      { to: '/funis', label: 'Funis', icon: Columns3 },
      { to: '/contatos', label: 'Contatos', icon: Users },
      { to: '/tarefas', label: 'Tarefas', icon: CheckSquare, badge: 'tasks' as const },
      { to: '/produtos', label: 'Produtos', icon: Package },
    ],
  },
  {
    section: 'Automação',
    items: [
      { to: '/agentes', label: 'Agentes de IA', icon: Bot },
      { to: '/chatbot', label: 'Chatbot', icon: Workflow },
      { to: '/follow-ups', label: 'Follow-ups', icon: Repeat },
      { to: '/conhecimento', label: 'Base de conhecimento', icon: BookOpen },
    ],
  },
  {
    section: 'Gestão',
    items: [
      { to: '/conexoes', label: 'Conexões', icon: Plug },
      { to: '/analises', label: 'Análises', icon: BarChart3 },
      { to: '/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
];

const PRESENCE: { value: Presence; label: string; dot: string }[] = [
  { value: 'online', label: 'Online', dot: 'bg-good' },
  { value: 'ausente', label: 'Ausente', dot: 'bg-warning' },
  { value: 'offline', label: 'Offline', dot: 'bg-ink-3' },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const me = useMe();
  const settings = useStore((s) => s.settings);
  const waiting = useStore((s) => s.conversations.filter((c) => c.status === 'aguardando').length);
  const unreadTotal = useStore((s) => s.conversations.reduce((a, c) => a + (c.status !== 'finalizado' ? c.unread : 0), 0));
  const lateTasks = useStore((s) => s.tasks.filter((t) => !t.done && new Date(t.dueAt) < new Date() && t.assigneeId === s.sessionUserId).length);
  const allNotifications = useStore((s) => s.notifications);
  const notifications = allNotifications.filter((n) => !n.userId || n.userId === me?.id);
  const update = useStore((s) => s.update);
  const logout = useStore((s) => s.logout);
  const navigate = useNavigate();

  const badges = { inbox: unreadTotal || waiting, tasks: lateTasks };
  const unreadNotif = notifications.filter((n) => !n.read).length;

  const doLogout = async () => {
    logout();
    if (supabase) {
      stopSync();
      await supabase.auth.signOut();
    }
    navigate('/login');
  };

  const sidebar = (
    <aside
      className={cn(
        'flex h-full flex-col bg-sidebar text-[#c9d6df] transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-[232px]',
      )}
    >
      <div className={cn('flex h-14 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-[15px] font-bold text-white">
          {settings.logoText.slice(0, 1).toUpperCase()}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-white">{settings.logoText}</div>
            <div className="truncate text-[11px] text-[#7f95a3]">{settings.companyName}</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-4" aria-label="Menu principal">
        {NAV.map((group) => (
          <div key={group.section} className="mt-4 first:mt-2">
            {!collapsed && <div className="mb-1 px-2.5 text-[10.5px] font-semibold tracking-wider text-[#6b8291] uppercase">{group.section}</div>}
            {group.items.map((it) => {
              const count = 'badge' in it && it.badge ? badges[it.badge] : 0;
              return (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={'end' in it ? it.end : false}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? it.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group relative mb-0.5 flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] transition-colors',
                      isActive ? 'bg-sidebar-active font-medium text-white' : 'hover:bg-sidebar-hover hover:text-white',
                      collapsed && 'justify-center px-0',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-brand-400" />}
                      <it.icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-brand-300')} />
                      {!collapsed && <span className="flex-1 truncate">{it.label}</span>}
                      {count > 0 && (
                        <span
                          className={cn(
                            'rounded-full bg-brand-500 px-1.5 text-[11px] leading-[18px] font-semibold text-white',
                            collapsed && 'absolute top-0.5 right-1.5 px-1 text-[10px] leading-4',
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <button
        onClick={() => setCollapsed((v) => !v)}
        className="hidden h-10 items-center justify-center gap-2 border-t border-white/5 text-[12px] text-[#7f95a3] hover:text-white lg:flex"
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Recolher menu</>}
      </button>
    </aside>
  );

  return (
    <div className="flex h-full">
      <div className="hidden lg:block">{sidebar}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" onClick={() => setMobileOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>{sidebar}</div>
          <div className="flex-1 bg-black/40" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
          <button className="lg:hidden" aria-label="Abrir menu" onClick={() => setMobileOpen(true)}>
            <MenuIcon className="h-5 w-5" />
          </button>
          <div className="flex-1" />

          <button
            onClick={() => useStore.getState().setSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
            aria-label={settings.theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            title={settings.theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-canvas hover:text-ink"
          >
            {settings.theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>

          <Menu
            width={340}
            trigger={(toggle) => (
              <button onClick={toggle} aria-label="Notificações" className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-canvas">
                <Bell className="h-[18px] w-[18px]" />
                {unreadNotif > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-semibold text-white">
                    {unreadNotif}
                  </span>
                )}
              </button>
            )}
          >
            {(close) => (
              <div>
                <div className="flex items-center justify-between px-2.5 py-2">
                  <span className="text-[13px] font-semibold">Notificações</span>
                  <button
                    className="text-xs text-brand-600 hover:underline"
                    onClick={() => notifications.forEach((n) => !n.read && update('notifications', n.id, { read: true }))}
                  >
                    Marcar todas como lidas
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 && <p className="px-2.5 py-6 text-center text-[13px] text-ink-3">Nenhuma notificação.</p>}
                  {[...notifications]
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .slice(0, 20)
                    .map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          update('notifications', n.id, { read: true });
                          if (n.link) navigate(n.link);
                          close();
                        }}
                        className="flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-canvas"
                      >
                        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-500')} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium">{n.title}</span>
                          <span className="block truncate text-xs text-ink-3">{n.body}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-ink-3">{relative(n.createdAt)}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </Menu>

          {me && (
            <Menu
              width={230}
              trigger={(toggle) => (
                <button onClick={toggle} className="flex items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 hover:bg-canvas">
                  <Avatar name={me.name} color={me.color} size={32} presence={me.presence} />
                  <span className="hidden text-left sm:block">
                    <span className="block text-[13px] leading-tight font-medium">{me.name}</span>
                    <span className="block text-[11px] leading-tight text-ink-3 capitalize">{me.role}</span>
                  </span>
                </button>
              )}
            >
              {(close) => (
                <div>
                  <div className="px-2.5 py-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Meu status</div>
                  {PRESENCE.map((p) => (
                    <MenuItem
                      key={p.value}
                      onClick={() => {
                        update('users', me.id, { presence: p.value });
                        close();
                      }}
                    >
                      <span className={cn('h-2 w-2 rounded-full', p.dot)} />
                      <span className="flex-1">{p.label}</span>
                      {me.presence === p.value && <span className="text-brand-600">✓</span>}
                    </MenuItem>
                  ))}
                  <div className="my-1 h-px bg-line" />
                  <MenuItem icon={<Settings />} onClick={() => (navigate('/configuracoes'), close())}>
                    Configurações
                  </MenuItem>
                  <MenuItem icon={<LogOut />} danger onClick={doLogout}>
                    Sair
                  </MenuItem>
                </div>
              )}
            </Menu>
          )}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-3">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
