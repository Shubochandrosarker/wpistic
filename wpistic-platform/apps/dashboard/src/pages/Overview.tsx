import { Link } from 'react-router-dom';
import { CreditCard, Globe, KeyRound, Plus, Sparkles, UserPlus } from 'lucide-react';
import { useCurrentOrg } from '../hooks/useAuth';
import {
  useCreditBalance,
  useInvoices,
  useLicenses,
  useNotifications,
  useOrgProducts,
  useSubscriptions,
  useWebsites,
} from '../hooks/useApi';
import { Badge, Button, Card, PageHeader, Skeleton, StatCard, statusBadgeVariant } from '../components/ui';
import { ProductCard, type OwnedProduct } from '../components/ProductCard';
import { formatDate, formatMoney, titleCase } from '../lib/format';

export function Overview() {
  const org = useCurrentOrg();
  const products = useOrgProducts();
  const licenses = useLicenses();
  const websites = useWebsites();
  const subscriptions = useSubscriptions();
  const credits = useCreditBalance();
  const invoices = useInvoices();
  const notifications = useNotifications();

  const activeLicenses = (licenses.data?.licenses ?? []).filter((l) => l.status === 'active');
  const connectedSites = (websites.data?.websites ?? []).filter((w) => w.is_connected);
  const activeSub = (subscriptions.data?.subscriptions ?? []).find((s) =>
    ['active', 'trialing', 'lifetime', 'past_due', 'grace_period'].includes(s.status)
  );
  const securityAlerts = (notifications.data?.notifications ?? []).filter(
    (n) => n.severity !== 'info' && !n.read_at
  );

  return (
    <div>
      <PageHeader
        title={org ? `${org.name}` : 'Overview'}
        description="Everything your organization owns across the WPistic ecosystem."
        action={
          <div className="flex gap-2">
            <Link to="/websites">
              <Button variant="secondary" size="sm">
                <Plus size={14} /> Add Website
              </Button>
            </Link>
            <Link to="/team">
              <Button variant="secondary" size="sm">
                <UserPlus size={14} /> Invite Team
              </Button>
            </Link>
            <Link to="/billing">
              <Button size="sm">
                <Sparkles size={14} /> Buy Credits
              </Button>
            </Link>
          </div>
        }
      />

      {securityAlerts.length > 0 && (
        <Card className="p-4 mb-6 border-warning/40">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-semibold text-amber-300">{securityAlerts.length} alert{securityAlerts.length > 1 ? 's' : ''}:</span>{' '}
              {securityAlerts[0]!.title}
            </p>
            <Link to="/security" className="text-[13px] text-accent hover:underline shrink-0">
              Review
            </Link>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Active licenses"
          value={licenses.isLoading ? <Skeleton className="h-7 w-10" /> : activeLicenses.length}
          icon={<KeyRound size={18} />}
        />
        <StatCard
          label="Connected websites"
          value={websites.isLoading ? <Skeleton className="h-7 w-10" /> : connectedSites.length}
          icon={<Globe size={18} />}
        />
        <StatCard
          label="Subscription"
          value={
            subscriptions.isLoading ? (
              <Skeleton className="h-7 w-20" />
            ) : activeSub ? (
              <Badge variant={statusBadgeVariant(activeSub.status)}>{titleCase(activeSub.status)}</Badge>
            ) : (
              <span className="text-muted text-base">None</span>
            )
          }
          hint={activeSub?.current_period_end ? `Renews ${formatDate(activeSub.current_period_end)}` : undefined}
          icon={<CreditCard size={18} />}
        />
        <StatCard
          label="AI credits"
          value={credits.isLoading ? <Skeleton className="h-7 w-14" /> : (credits.data?.balance ?? 0).toLocaleString()}
          icon={<Sparkles size={18} />}
        />
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Your products</h2>
        {products.isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44" />
            ))}
          </div>
        ) : (products.data?.products ?? []).length === 0 ? (
          <Card>
            <div className="p-8 text-center">
              <p className="font-semibold">No products yet</p>
              <p className="text-sm text-muted mt-1">Purchases and licenses will appear here.</p>
            </div>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(products.data?.products ?? []).map((p) => (
              <ProductCard key={p.id} product={p as unknown as OwnedProduct} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">Recent invoices</h2>
          <Link to="/billing" className="text-[13px] text-accent hover:underline">
            View all
          </Link>
        </div>
        <Card>
          {(invoices.data?.invoices ?? []).slice(0, 3).length === 0 ? (
            <p className="p-5 text-sm text-muted">No invoices yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {(invoices.data?.invoices ?? []).slice(0, 3).map((inv) => (
                <li key={inv.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-muted">{formatDate(inv.created_at)}</span>
                  <span className="font-medium">{formatMoney(inv.amount_due, inv.currency)}</span>
                  <Badge variant={statusBadgeVariant(inv.status)}>{titleCase(inv.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
