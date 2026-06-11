import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { PageWrap, ProductGlyph } from '../components/widgets.jsx';
import { Card, Badge, Btn, TextInput, STATUS_TONE } from '../components/atoms.jsx';
import { SkeletonGrid, ErrorState, EmptyState } from '../components/states.jsx';

export default function Products() {
  const { data, loading, error, reload } = useApi(() => api.wpistic('products'), []);
  const [q, setQ] = useState('');

  if (loading) return <PageWrap><SkeletonGrid count={6} columns={3} /></PageWrap>;
  if (error) return <PageWrap><ErrorState error={error} onRetry={reload} /></PageWrap>;

  const products = (data?.products || []).filter(
    (p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.tagline.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <PageWrap>
      <div style={{ marginBottom: 20, maxWidth: 360 }}>
        <TextInput placeholder="Search products…" icon="search" value={q} onChange={setQ} />
      </div>

      {products.length === 0 ? (
        <EmptyState icon="cube" title="No products found" message="Try a different search term." />
      ) : (
        <div className="wpt-grid wpt-grid-3">
          {products.map((p) => (
            <Card key={p.id} hoverable>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <ProductGlyph category={p.category} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--app-text)' }}>{p.name}</span>
                    {p.flagship && <Badge tone="purple">Flagship</Badge>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--app-text-4)', marginTop: 2 }}>{p.category}</div>
                </div>
                <Badge tone={STATUS_TONE[p.status] || 'gray'} dot>{p.status}</Badge>
              </div>
              <p style={{ fontSize: 13, color: 'var(--app-text-2)', lineHeight: 1.6, margin: '14px 0 16px' }}>{p.tagline}</p>
              <Btn variant="border-card" size="sm" rightIcon="arrow" style={{ width: '100%' }}>Open product</Btn>
            </Card>
          ))}
        </div>
      )}
    </PageWrap>
  );
}
