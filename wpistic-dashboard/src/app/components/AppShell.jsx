// App shell: sidebar + topbar + routed content outlet.
// Ported from the approved shell.jsx and wired to React Router + boot data.

import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from './Icon.jsx';
import { Logo, TextInput, Badge } from './atoms.jsx';
import { boot } from '../lib/boot.js';

const SIDEBAR_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { to: '/', end: true, icon: 'dashboard', label: 'Dashboard' },
      { to: '/products', icon: 'cube', label: 'Products' },
      { to: '/licenses', icon: 'key', label: 'Licenses' },
      { to: '/downloads', icon: 'download', label: 'Downloads' },
      { to: '/websites', icon: 'globe', label: 'Websites' },
    ],
  },
  {
    label: 'Automation',
    items: [
      { to: '/agents', icon: 'bot', label: 'AI Agents' },
      { to: '/automations', icon: 'zap', label: 'Automations' },
    ],
  },
  {
    label: 'Customer',
    items: [
      { to: '/crm', icon: 'users', label: 'CRM' },
      { to: '/inbox', icon: 'inbox', label: 'Inbox' },
      { to: '/analytics', icon: 'chart', label: 'Analytics' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/billing', icon: 'card', label: 'Billing' },
      { to: '/support', icon: 'help', label: 'Support' },
      { to: '/developers', icon: 'code', label: 'Developers' },
      { to: '/settings', icon: 'cog', label: 'Settings' },
    ],
  },
];

function Sidebar() {
  const ws = boot.workspace;
  const initials = (ws?.name || boot.currentUser.name || 'WS').slice(0, 2).toUpperCase();
  return (
    <aside className="wpistic-scroll" style={{
      width: 256, height: '100%', overflowY: 'auto', background: '#fff',
      borderRight: '1px solid #EDEFF8', display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{ padding: '20px 22px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F0F2FF' }}>
        <a href={boot.homeUrl}><Logo size={28} /></a>
        <a href={boot.homeUrl} title="View site" style={{ background: '#F0F2FF', borderRadius: 8, width: 30, height: 30, display: 'grid', placeItems: 'center', color: '#6B7280' }}>
          <Icon name="external" size={14} />
        </a>
      </div>

      <div style={{ padding: '14px 14px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', background: '#F8F9FF', border: '1px solid #EDEFF8', borderRadius: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg, #6C5CE7, #4137A8)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0D0F1A', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {ws?.name || 'Your Workspace'}
            </div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2, textTransform: 'capitalize' }}>
              {boot.plan?.name || 'Free'}
            </div>
          </div>
          <Icon name="cog" size={14} color="#9499BA" />
        </div>
      </div>

      <nav style={{ padding: '16px 14px', flex: 1 }}>
        {SIDEBAR_GROUPS.map((g, gi) => (
          <div key={g.label} style={{ marginBottom: gi === SIDEBAR_GROUPS.length - 1 ? 0 : 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9499BA', padding: '6px 12px 8px' }}>{g.label}</div>
            {g.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                className={({ isActive }) => 'wpistic-side-item' + (isActive ? ' active' : '')}
              >
                <Icon name={it.icon} size={17} />
                <span style={{ flex: 1 }}>{it.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div style={{ padding: 14, paddingTop: 0 }}>
        <div style={{ background: 'linear-gradient(145deg, #1A1659, #0D0F1A)', borderRadius: 14, padding: 16, color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, background: 'radial-gradient(circle, rgba(108,92,231,0.45), transparent 70%)' }} />
          <div style={{ position: 'relative' }}>
            <Badge tone="green" dot>{boot.plan?.name || 'Free'}</Badge>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 10, lineHeight: 1.35 }}>Manage your plan</div>
            <a href={`${boot.basePath}/billing`} style={{ display: 'block', textDecoration: 'none', marginTop: 12, width: '100%', background: '#fff', color: '#6C5CE7', borderRadius: 9999, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, textAlign: 'center', boxSizing: 'border-box' }}>
              Upgrade plan
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Topbar() {
  const u = boot.currentUser;
  return (
    <header style={{ height: 64, flexShrink: 0, background: '#fff', borderBottom: '1px solid #EDEFF8', display: 'flex', alignItems: 'center', padding: '0 28px', gap: 20 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <PageHeading />
      </div>
      <TextInput placeholder="Search products, sites, licenses…" icon="search" size="sm" style={{ width: 320 }} />
      <a href={boot.logoutUrl} title="Sign out" style={{ width: 36, height: 36, borderRadius: 10, background: '#F8F9FF', border: '1px solid #EDEFF8', display: 'grid', placeItems: 'center', color: '#4B5263' }}>
        <Icon name="logout" size={16} />
      </a>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 12px 4px 4px', background: '#F8F9FF', border: '1px solid #EDEFF8', borderRadius: 9999 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #00C04B, #6C5CE7)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, overflow: 'hidden' }}>
          {u.avatar ? <img src={u.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : u.initials}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0D0F1A' }}>{u.name}</div>
      </div>
    </header>
  );
}

const TITLES = {
  '/': ['Dashboard', "Today's overview"],
  '/products': ['Products', 'Browse and manage the WordPressistic ecosystem'],
  '/licenses': ['Licenses', 'Activations, domains, renewals'],
  '/downloads': ['Downloads', 'Latest builds and changelogs'],
  '/websites': ['Websites', 'Connected WordPress sites'],
  '/agents': ['AI Agents', 'Marketplace and active agents'],
  '/automations': ['Automations', 'When-this-then-that workflows'],
  '/crm': ['CRM', 'Contacts across every channel'],
  '/inbox': ['Inbox', 'WhatsApp, web chat, email, and tickets'],
  '/analytics': ['Analytics', 'Traffic, revenue, AI usage across sites'],
  '/billing': ['Billing', 'Plan, payment method, invoices'],
  '/support': ['Support', 'Tickets, knowledge base, live chat'],
  '/developers': ['Developers', 'API keys, webhooks, REST docs'],
  '/settings': ['Settings', 'Profile, workspace, team, security'],
};

function PageHeading() {
  const { pathname } = useLocation();
  const key = pathname === '' ? '/' : '/' + pathname.split('/')[1];
  const [title, subtitle] = TITLES[key] || TITLES['/'];
  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#0D0F1A', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: '#6B7280', marginTop: 2 }}>{subtitle}</div>
    </>
  );
}

export default function AppShell() {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-page, #F0F2FF)' }}>
        <Topbar />
        <main className="wpistic-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
