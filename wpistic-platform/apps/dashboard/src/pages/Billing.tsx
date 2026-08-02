import { CreditCard, ExternalLink, Download, Sparkles } from 'lucide-react';
import { useCreditLedger, useInvoices, useOrgMutation, useSubscriptions, useCreditBalance } from '../hooks/useApi';
import { api } from '../lib/api-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  Table,
  Td,
  statusBadgeVariant,
} from '../components/ui';
import { formatDate, formatMoney, titleCase } from '../lib/format';

export function Billing() {
  const subscriptions = useSubscriptions();
  const invoices = useInvoices();
  const balance = useCreditBalance();
  const ledger = useCreditLedger();

  const portal = useOrgMutation([], (orgId) => api.createBillingPortal(orgId));
  const cancel = useOrgMutation(['subscriptions'], (orgId, subscriptionId: string) =>
    api.cancelSubscription(orgId, subscriptionId)
  );

  const openPortal = async () => {
    const { portal_url: url } = await portal.mutateAsync(undefined as never);
    window.location.assign(url);
  };

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Subscriptions, invoices, payment methods, and AI credits — one billing relationship for everything."
        action={
          <Button size="sm" variant="secondary" onClick={openPortal} disabled={portal.isPending}>
            <CreditCard size={14} /> Payment methods <ExternalLink size={12} />
          </Button>
        }
      />

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Subscriptions</h2>
        {subscriptions.isLoading ? (
          <Skeleton className="h-28" />
        ) : (subscriptions.data?.subscriptions ?? []).length === 0 ? (
          <Card>
            <EmptyState
              title="No subscriptions"
              description="Purchases made on any WPistic product site appear here."
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {(subscriptions.data?.subscriptions ?? []).map((sub) => (
              <Card key={sub.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {sub.items.map((item) => (
                      <Badge key={`${item.product}-${item.plan}`} variant="accent">
                        {item.product_name} · {titleCase(item.plan)}
                        {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                      </Badge>
                    ))}
                    <Badge variant={statusBadgeVariant(sub.status)}>{titleCase(sub.status)}</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] text-muted">
                      {sub.cancel_at_period_end
                        ? `Ends ${formatDate(sub.current_period_end)}`
                        : sub.current_period_end
                          ? `Renews ${formatDate(sub.current_period_end)}`
                          : 'Lifetime'}
                    </span>
                    {!sub.cancel_at_period_end && sub.status !== 'lifetime' && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          if (confirm('Cancel at the end of the current period? Access continues until then.')) {
                            void cancel.mutateAsync(sub.id);
                          }
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">AI credits</h2>
          <span className="text-sm font-semibold text-accent flex items-center gap-1.5">
            <Sparkles size={14} />
            {balance.data ? balance.data.balance.toLocaleString() : '—'} credits
          </span>
        </div>
        <Card>
          {ledger.isLoading ? (
            <div className="p-5">
              <Skeleton className="h-24" />
            </div>
          ) : (ledger.data?.entries ?? []).length === 0 ? (
            <p className="p-5 text-sm text-muted">No credit activity yet. Credits are granted with AI-enabled plans.</p>
          ) : (
            <Table headers={['Date', 'Type', 'Description', 'Amount', 'Balance']}>
              {(ledger.data?.entries ?? []).slice(0, 10).map((entry) => (
                <tr key={entry.id}>
                  <Td>
                    <span className="text-[13px] text-muted">{formatDate(entry.created_at)}</span>
                  </Td>
                  <Td>
                    <Badge variant={entry.amount > 0 ? 'success' : 'default'}>{titleCase(entry.entry_type)}</Badge>
                  </Td>
                  <Td>
                    <span className="text-[13px]">{entry.description ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className={`text-[13px] font-mono ${entry.amount > 0 ? 'text-green-300' : 'text-muted'}`}>
                      {entry.amount > 0 ? '+' : ''}
                      {entry.amount}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[13px] font-mono">{entry.balance_after}</span>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Invoice history</h2>
        <Card>
          {invoices.isLoading ? (
            <div className="p-5">
              <Skeleton className="h-24" />
            </div>
          ) : (invoices.data?.invoices ?? []).length === 0 ? (
            <p className="p-5 text-sm text-muted">No invoices yet.</p>
          ) : (
            <Table headers={['Date', 'Amount', 'Status', 'PDF']}>
              {(invoices.data?.invoices ?? []).map((inv) => (
                <tr key={inv.id}>
                  <Td>
                    <span className="text-[13px]">{formatDate(inv.created_at)}</span>
                  </Td>
                  <Td>
                    <span className="font-medium">{formatMoney(inv.amount_due, inv.currency)}</span>
                  </Td>
                  <Td>
                    <Badge variant={statusBadgeVariant(inv.status)}>{titleCase(inv.status)}</Badge>
                  </Td>
                  <Td>
                    {inv.pdf_url ? (
                      <a href={inv.pdf_url} target="_blank" rel="noreferrer" className="text-accent hover:underline inline-flex items-center gap-1 text-[13px]">
                        <Download size={13} /> Download
                      </a>
                    ) : (
                      <span className="text-muted text-[13px]">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </section>
    </div>
  );
}
