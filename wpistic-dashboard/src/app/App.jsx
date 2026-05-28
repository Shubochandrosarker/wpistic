import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { boot } from './lib/boot.js';
import { ToastProvider } from './components/states.jsx';
import AppShell from './components/AppShell.jsx';

import DashboardHome from './pages/DashboardHome.jsx';
import Products from './pages/Products.jsx';
import Licenses from './pages/Licenses.jsx';
import Downloads from './pages/Downloads.jsx';
import Websites from './pages/Websites.jsx';
import Billing from './pages/Billing.jsx';
import Developers from './pages/Developers.jsx';
import Settings from './pages/Settings.jsx';
import Support from './pages/Support.jsx';
import ModulePage from './pages/ModulePage.jsx';

export default function App() {
  return (
    <ToastProvider>
      {/* basename keeps React Router in sync with the /dashboard mount point. */}
      <BrowserRouter basename={boot.basePath || '/dashboard'}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardHome />} />
            <Route path="products" element={<Products />} />
            <Route path="licenses" element={<Licenses />} />
            <Route path="downloads" element={<Downloads />} />
            <Route path="websites" element={<Websites />} />
            <Route path="agents" element={<ModulePage icon="bot" title="AI Agents" description="Drop-in AI agents for support, sales, SEO, and operations." />} />
            <Route path="automations" element={<ModulePage icon="zap" title="Automations" description="When-this-then-that workflows across your WPistic plugins." />} />
            <Route path="crm" element={<ModulePage icon="users" title="CRM" description="Contacts, deals, and timelines synced across every channel." />} />
            <Route path="inbox" element={<ModulePage icon="inbox" title="Inbox" description="Unified WhatsApp, web chat, email, and support tickets." />} />
            <Route path="analytics" element={<ModulePage icon="chart" title="Analytics" description="Traffic, revenue, and AI usage across all your sites." />} />
            <Route path="billing" element={<Billing />} />
            <Route path="support" element={<Support />} />
            <Route path="developers" element={<Developers />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<DashboardHome />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
