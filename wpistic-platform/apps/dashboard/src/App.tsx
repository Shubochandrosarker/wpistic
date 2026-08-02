import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Layout } from './components/Layout';
import { Skeleton } from './components/ui';
import { useAuthBoot, useIdentity, redirectToLogin } from './hooks/useAuth';
import { useAuthStore } from './stores/auth';
import { Overview } from './pages/Overview';
import { Products } from './pages/Products';
import { Websites } from './pages/Websites';
import { Licenses } from './pages/Licenses';
import { Billing } from './pages/Billing';
import { Team } from './pages/Team';
import { Security } from './pages/Security';
import { Settings } from './pages/Settings';
import { AuthCallback } from './pages/AuthCallback';
import { AcceptInvitation } from './pages/AcceptInvitation';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

function BootScreen() {
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="w-72 space-y-3">
        <Skeleton className="h-8 w-8 rounded-lg mx-auto" />
        <Skeleton className="h-3 w-40 mx-auto" />
      </div>
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  useIdentity();

  if (status === 'booting') return <BootScreen />;
  if (status === 'unauthenticated') {
    redirectToLogin();
    return <BootScreen />;
  }
  return <>{children}</>;
}

export function App() {
  useAuthBoot();
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route path="/" element={<Overview />} />
            <Route path="/products" element={<Products />} />
            <Route path="/websites" element={<Websites />} />
            <Route path="/licenses" element={<Licenses />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/team" element={<Team />} />
            <Route path="/security" element={<Security />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/invitations/accept" element={<AcceptInvitation />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
