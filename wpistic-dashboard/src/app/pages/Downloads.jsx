import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { PageWrap } from '../components/widgets.jsx';
import { Card, Btn, Badge } from '../components/atoms.jsx';
import { Icon } from '../components/Icon.jsx';
import { SkeletonRows, ErrorState, EmptyState } from '../components/states.jsx';

export default function Downloads() {
  const { data, loading, error, reload } = useApi(() => api.licenseistic('downloads'), []);

  if (loading) return <PageWrap><SkeletonRows count={5} /></PageWrap>;
  if (error) return <PageWrap><ErrorState error={error} onRetry={reload} /></PageWrap>;

  const downloads = data?.downloads || [];

  if (downloads.length === 0) {
    return (
      <PageWrap>
        <EmptyState icon="download" title="No downloads available"
          message="Builds for the products in your plan will appear here. Activate a license to unlock downloads." />
      </PageWrap>
    );
  }

  return (
    <PageWrap>
      <div style={{ display: 'grid', gap: 14 }}>
        {downloads.map((d) => (
          <Card key={d.id || d.slug} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--app-accent-soft)', color: '#6C5CE7', display: 'grid', placeItems: 'center' }}>
              <Icon name="cube" size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--app-text)' }}>{d.name || d.slug}</div>
              <div style={{ fontSize: 12, color: 'var(--app-text-4)', marginTop: 2 }}>
                v{d.version || '—'} · {d.released_at || 'latest build'}
              </div>
            </div>
            {d.stable && <Badge tone="green" dot>Stable</Badge>}
            <Btn variant="border-card" size="sm" leftIcon="download" onClick={() => d.url && window.open(d.url, '_blank', 'noopener')}>
              Download
            </Btn>
          </Card>
        ))}
      </div>
    </PageWrap>
  );
}
