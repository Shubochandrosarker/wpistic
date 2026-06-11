import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { boot } from '../lib/boot.js';
import { PageWrap } from '../components/widgets.jsx';
import { Card, Btn, Badge, TextInput, STATUS_TONE } from '../components/atoms.jsx';
import { Icon } from '../components/Icon.jsx';
import { SkeletonRows, ErrorState, EmptyState, Banner, useToast } from '../components/states.jsx';

export default function Websites() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.wpistic('websites'), []);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState(null);

  const canManage = boot.currentUser.caps?.manage_websites;

  const connect = async () => {
    if (!url) return;
    setBusy(true);
    try {
      const res = await api.post('websites', { url, name }, { ns: 'wpistic' });
      setToken(res.token);
      setUrl('');
      setName('');
      toast('Website connected. Copy your connector token now.', 'success');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (id) => {
    try {
      await api.del(`websites/${id}`, { ns: 'wpistic' });
      toast('Website disconnected.', 'success');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (loading) return <PageWrap><SkeletonRows count={4} /></PageWrap>;
  if (error) return <PageWrap><ErrorState error={error} onRetry={reload} /></PageWrap>;

  const websites = data?.websites || [];

  return (
    <PageWrap>
      {token && (
        <Banner tone="green" title="Connector token (shown once)"
          message={token}
          onDismiss={() => setToken(null)} />
      )}

      {canManage && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--app-text)', marginBottom: 12 }}>Connect a website</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextInput placeholder="https://yoursite.com" icon="globe" value={url} onChange={setUrl} style={{ flex: 1, minWidth: 220 }} />
            <TextInput placeholder="Friendly name (optional)" value={name} onChange={setName} style={{ width: 220 }} />
            <Btn variant="green" leftIcon="plus" onClick={connect} disabled={busy || !url}>{busy ? 'Connecting…' : 'Connect'}</Btn>
          </div>
        </Card>
      )}

      {websites.length === 0 ? (
        <EmptyState icon="globe" title="No website connected yet"
          message="Connect your first WordPress site to activate licenses, sync analytics, and run automations." />
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {websites.map((w) => (
            <Card key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#E8FAF0', color: '#007C2F', display: 'grid', placeItems: 'center' }}>
                <Icon name="globe" size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--app-text)' }}>{w.name}</div>
                <div style={{ fontSize: 12, color: 'var(--app-text-4)', marginTop: 2 }}>{w.url}</div>
              </div>
              <Badge tone={STATUS_TONE[w.status] || 'gray'} dot>{w.status}</Badge>
              {canManage && <Btn variant="ghost-gray" size="xs" onClick={() => disconnect(w.id)}>Disconnect</Btn>}
            </Card>
          ))}
        </div>
      )}
    </PageWrap>
  );
}
