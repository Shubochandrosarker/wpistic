import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { boot } from '../lib/boot.js';
import { PageWrap } from '../components/widgets.jsx';
import { Card, Btn, Badge, TextInput, SectionLabel } from '../components/atoms.jsx';
import { Icon } from '../components/Icon.jsx';
import { SkeletonRows, ErrorState, EmptyState, Banner, useToast } from '../components/states.jsx';

export default function Developers() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.wpistic('api-keys'), []);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [freshKey, setFreshKey] = useState(null);

  const create = async () => {
    if (!label) return;
    setBusy(true);
    try {
      const res = await api.post('api-keys', { label }, { ns: 'wpistic' });
      setFreshKey(res.key.plain);
      setLabel('');
      toast('API key created.', 'success');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (id) => {
    try {
      const res = await api.post(`api-keys/${id}/regenerate`, {}, { ns: 'wpistic' });
      setFreshKey(res.key.plain);
      toast('API key regenerated. Update your integrations.', 'success');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const revoke = async (id) => {
    try {
      await api.del(`api-keys/${id}`, { ns: 'wpistic' });
      toast('API key revoked.', 'success');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (loading) return <PageWrap><SkeletonRows count={3} /></PageWrap>;
  if (error) return <PageWrap><ErrorState error={error} onRetry={reload} /></PageWrap>;

  const keys = data?.keys || [];

  return (
    <PageWrap>
      {freshKey && (
        <Banner tone="green" title="New API key (copy it now — shown once)"
          message={freshKey}
          action={<Btn size="xs" variant="soft" leftIcon="copy" onClick={() => { navigator.clipboard?.writeText(freshKey); toast('Copied.', 'info'); }}>Copy</Btn>}
          onDismiss={() => setFreshKey(null)} />
      )}

      <div className="wpt-grid wpt-split-dev" style={{ marginBottom: 22 }}>
        <Card>
          <SectionLabel>Create API key</SectionLabel>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <TextInput placeholder="Key label (e.g. Production server)" icon="code" value={label} onChange={setLabel} style={{ flex: 1 }} />
            <Btn variant="primary" leftIcon="plus" onClick={create} disabled={busy || !label}>Create</Btn>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--app-text-3)', marginTop: 12, lineHeight: 1.6 }}>
            Keys are hashed at rest — we never store the raw value. Authenticate REST calls with the
            <code style={{ margin: '0 4px' }}>X-WPistic-Key</code> header.
          </p>
        </Card>
        <Card dark style={{ color: '#fff' }}>
          <SectionLabel light style={{ color: '#9499BA' }}>REST base</SectionLabel>
          <code style={{ fontSize: 12, color: '#fff', background: 'rgba(255,255,255,0.08)', padding: '8px 10px', borderRadius: 8, display: 'block', wordBreak: 'break-all' }}>
            {boot.restUrl}wpistic/v1
          </code>
          <div style={{ marginTop: 14 }}>
            <a href={`${boot.restUrl}wpistic/v1`} target="_blank" rel="noopener" style={{ color: '#8EE5B2', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
              View endpoints →
            </a>
          </div>
        </Card>
      </div>

      <Card padding={0}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--app-border-3)' }}>
          <SectionLabel style={{ margin: 0 }}>Active keys</SectionLabel>
        </div>
        {keys.length === 0 ? (
          <EmptyState icon="code" title="No API keys yet" message="Create your first key above to start using the WPistic REST API." />
        ) : (
          keys.map((k) => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 22px', borderBottom: '1px solid var(--app-border-3)' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--app-accent-soft)', color: '#6C5CE7', display: 'grid', placeItems: 'center' }}>
                <Icon name="key" size={17} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--app-text)' }}>{k.label}</div>
                <code style={{ fontSize: 12 }}>{k.prefix}••••••••</code>
              </div>
              {k.revoked ? <Badge tone="red">Revoked</Badge> : <Badge tone="green" dot>Active</Badge>}
              {!k.revoked && (
                <>
                  <Btn variant="ghost-gray" size="xs" onClick={() => regenerate(k.id)}>Regenerate</Btn>
                  <Btn variant="ghost-gray" size="xs" onClick={() => revoke(k.id)}>Revoke</Btn>
                </>
              )}
            </div>
          ))
        )}
      </Card>
    </PageWrap>
  );
}
