import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { boot } from '../lib/boot.js';
import { PageWrap, StatCard } from '../components/widgets.jsx';
import { Card, Btn, Badge, SectionLabel } from '../components/atoms.jsx';
import { Icon } from '../components/Icon.jsx';
import {
  SkeletonGrid, ErrorState, EmptyState, Banner,
  TrialEndingBanner, PaymentFailedBanner, NoWebsiteBanner,
} from '../components/states.jsx';

export default function DashboardHome() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => api.wpistic('dashboard'), []);

  if (loading) {
    return (
      <PageWrap>
        <SkeletonGrid count={4} columns={4} />
      </PageWrap>
    );
  }
  if (error) {
    return <PageWrap><ErrorState error={error} onRetry={reload} /></PageWrap>;
  }

  if (!data || data.empty || !data.workspace) {
    return (
      <PageWrap>
        <EmptyState
          icon="spark"
          title="Welcome to WPistic"
          message="Let’s set up your workspace. Create one to start connecting sites, activating licenses, and automating your business."
          action={<Btn variant="green" rightIcon="arrow" onClick={() => navigate('/settings')}>Create workspace</Btn>}
        />
      </PageWrap>
    );
  }

  const { stats = {}, subscription = {}, websites = [], activity = [] } = data;
  const sub = subscription || {};

  // Account-state banners.
  const banners = [];
  if (sub.status === 'past_due') banners.push(<PaymentFailedBanner key="pf" onFix={() => navigate('/billing')} />);
  if (sub.status === 'trialing' && sub.trial_days_left != null) {
    banners.push(<TrialEndingBanner key="te" days={sub.trial_days_left} onUpgrade={() => navigate('/billing')} />);
  }
  if (websites.length === 0) banners.push(<NoWebsiteBanner key="nw" onConnect={() => navigate('/websites')} />);
  if (stats.licenses_attn > 0) {
    banners.push(
      <Banner key="la" tone="amber" title={`${stats.licenses_attn} license${stats.licenses_attn === 1 ? '' : 's'} need attention.`}
        message="One or more licenses are expiring, expired, or suspended."
        action={<Btn size="xs" variant="outline" onClick={() => navigate('/licenses')}>Review</Btn>} />
    );
  }

  return (
    <PageWrap>
      {banners}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginBottom: 22 }}>
        <StatCard label="Active licenses" value={stats.licenses ?? 0} icon="key" />
        <StatCard label="Connected sites" value={stats.websites ?? 0} icon="globe" iconBg="#E8FAF0" iconColor="#007C2F" />
        <StatCard label="Need attention" value={stats.licenses_attn ?? 0} icon="warn" iconBg="#FEF3C7" iconColor="#92400E" />
        <StatCard label="Plan" value={boot.plan?.name || 'Free'} icon="card" iconBg="#DBEAFE" iconColor="#1E40AF" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 18 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <SectionLabel style={{ margin: 0 }}>Recent activity</SectionLabel>
            <Btn variant="ghost-gray" size="xs" leftIcon="refresh" onClick={reload}>Refresh</Btn>
          </div>
          {activity.length === 0 ? (
            <div style={{ padding: '28px 0', textAlign: 'center', color: '#6B7280', fontSize: 13 }}>No activity yet.</div>
          ) : (
            activity.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid #F0F2FF' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: '#F3F1FE', color: '#6C5CE7', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon name="spark" size={15} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#2E3245', fontWeight: 500 }}>{a.message || a.event_type}</div>
                  <div style={{ fontSize: 11.5, color: '#9499BA', marginTop: 2 }}>{a.created_at}</div>
                </div>
              </div>
            ))
          )}
        </Card>

        <Card dark style={{ color: '#fff' }}>
          <Badge tone="green" dot>{sub.plan_name || boot.plan?.name || 'Free'}</Badge>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 12, letterSpacing: '-0.02em' }}>Your subscription</div>
          <p style={{ fontSize: 13, color: '#9499BA', lineHeight: 1.6, marginTop: 6 }}>
            Status: <span style={{ color: '#fff', textTransform: 'capitalize' }}>{sub.status || 'active'}</span>
            {sub.renews_at ? <> · renews {sub.renews_at}</> : null}
          </p>
          <Btn variant="white" size="sm" rightIcon="arrow" style={{ marginTop: 16 }} onClick={() => navigate('/billing')}>
            Manage billing
          </Btn>
        </Card>
      </div>
    </PageWrap>
  );
}
