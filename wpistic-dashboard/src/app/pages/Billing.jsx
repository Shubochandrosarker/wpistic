import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { boot } from '../lib/boot.js';
import { PageWrap, DataTable } from '../components/widgets.jsx';
import { Card, Btn, Badge, SectionLabel, STATUS_TONE } from '../components/atoms.jsx';
import {
  SkeletonGrid, ErrorState, TrialEndingBanner, PaymentFailedBanner,
} from '../components/states.jsx';

export default function Billing() {
  const sub = useApi(() => api.memberistic('subscription'), []);
  const inv = useApi(() => api.memberistic('invoices'), []);

  if (sub.loading) return <PageWrap><SkeletonGrid count={3} columns={3} /></PageWrap>;
  if (sub.error) return <PageWrap><ErrorState error={sub.error} onRetry={sub.reload} /></PageWrap>;

  const subscription = sub.data?.subscription || {};
  const invoices = inv.data?.invoices || [];

  const columns = [
    { key: 'number', label: 'Invoice' },
    { key: 'date', label: 'Date' },
    { key: 'amount', label: 'Amount' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '' },
  ];
  const renderCell = (key, row) => {
    if (key === 'status') return <Badge tone={STATUS_TONE[row.status] || 'gray'} dot>{row.status}</Badge>;
    if (key === 'actions') return row.url ? <Btn variant="ghost" size="xs" onClick={() => window.open(row.url, '_blank', 'noopener')}>View</Btn> : null;
    if (key === 'amount') return row.amount ? `$${row.amount}` : '—';
    return row[key] ?? '—';
  };

  return (
    <PageWrap>
      {subscription.status === 'past_due' && <PaymentFailedBanner onFix={() => {}} />}
      {subscription.status === 'trialing' && subscription.trial_days_left != null && (
        <TrialEndingBanner days={subscription.trial_days_left} onUpgrade={() => {}} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginBottom: 22 }}>
        <Card dark style={{ color: '#fff' }}>
          <Badge tone="green" dot>{subscription.plan_name || boot.plan?.name || 'Free'}</Badge>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 12, letterSpacing: '-0.02em' }}>
            {subscription.plan_name || boot.plan?.name || 'Free'} plan
          </div>
          <p style={{ fontSize: 13, color: '#9499BA', lineHeight: 1.6, marginTop: 6 }}>
            Status: <span style={{ color: '#fff', textTransform: 'capitalize' }}>{subscription.status || 'active'}</span>
            {subscription.renews_at ? <> · renews {subscription.renews_at}</> : null}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <Btn variant="white" size="sm">Change plan</Btn>
            <Btn variant="dark-outline" size="sm">Payment method</Btn>
          </div>
        </Card>

        <Card>
          <SectionLabel>Usage this period</SectionLabel>
          <div style={{ fontSize: 13, color: '#4B5263', lineHeight: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Websites</span><strong>{subscription.usage?.websites ?? '—'}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>API calls</span><strong>{subscription.usage?.api_calls ?? '—'}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>AI runs</span><strong>{subscription.usage?.ai_runs ?? '—'}</strong></div>
          </div>
        </Card>
      </div>

      <Card padding={0}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F0F2FF' }}>
          <SectionLabel style={{ margin: 0 }}>Invoices</SectionLabel>
        </div>
        <DataTable columns={columns} rows={invoices} renderCell={renderCell} empty="No invoices yet." />
      </Card>
    </PageWrap>
  );
}
