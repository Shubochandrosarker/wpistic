import { NavLink, Outlet } from 'react-router-dom';
import {
  Bell,
  CreditCard,
  Globe,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { OrgSwitcher } from './OrgSwitcher';
import { ProductSwitcher } from './ProductSwitcher';
import { useAuthStore } from '../stores/auth';
import { useNotifications } from '../hooks/useApi';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/websites', label: 'Websites', icon: Globe },
  { to: '/licenses', label: 'Licenses', icon: KeyRound },
  { to: '/billing', label: 'Billing', icon: CreditCard },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/security', label: 'Security', icon: Shield },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {
  const user = useAuthStore((s) => s.user);
  const impersonation = useAuthStore((s) => s.impersonation);
  const signOut = useAuthStore((s) => s.signOut);
  const { data: notificationData } = useNotifications();
  const unread = (notificationData?.notifications ?? []).filter((n) => !n.read_at).length;

  return (
    <div className="min-h-screen flex">
      {impersonation && (
        <div className="fixed top-0 inset-x-0 z-50 bg-warning text-background text-center text-[13px] font-semibold py-1.5">
          Support session — a WPistic staff member is viewing this workspace. Billing and destructive actions are disabled.
        </div>
      )}

      <aside className={`w-60 shrink-0 border-r border-border bg-[#0D0D0E] flex flex-col ${impersonation ? 'pt-8' : ''} max-md:hidden`}>
        <div className="px-4 py-5 flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-accent grid place-items-center text-background font-bold">W</span>
          <span className="font-semibold tracking-tight">WPistic</span>
        </div>
        <div className="px-3 pb-4">
          <OrgSwitcher />
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-surface text-white font-medium' : 'text-[#A1A1A1] hover:text-white hover:bg-surface/60'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <span className="w-7 h-7 rounded-full bg-surface-hover border border-border grid place-items-center text-[12px] font-semibold">
              {user?.first_name?.charAt(0) ?? user?.email.charAt(0).toUpperCase() ?? '·'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium truncate">
                {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email}
              </p>
              <p className="text-[11px] text-muted truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => void signOut().then(() => window.location.assign('/'))}
              className="text-muted hover:text-white transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className={`flex-1 min-w-0 flex flex-col ${impersonation ? 'pt-8' : ''}`}>
        <header className="h-14 border-b border-border flex items-center justify-end gap-1 px-4 md:px-6">
          <NavLink to="/settings" className="relative p-2 rounded-lg text-muted hover:text-white hover:bg-surface transition-colors" title="Notifications">
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-background text-[10px] font-bold grid place-items-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </NavLink>
          <ProductSwitcher />
        </header>
        <main className="flex-1 px-4 md:px-6 py-6 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
