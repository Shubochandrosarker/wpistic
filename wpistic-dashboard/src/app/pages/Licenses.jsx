import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { boot } from '../lib/boot.js';
import { PageWrap, DataTable } from '../components/widgets.jsx';
import { Card, Badge, Btn, STATUS_TONE } from '../components/atoms.jsx';
import { SkeletonRows, ErrorState, EmptyState, useToast } from '../components/states.jsx';

export default function Licenses() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.licenseistic('licenses'), []);

  if (loading) return <PageWrap><SkeletonRows count={6} /></PageWrap>;
  if (error) return <PageWrap><ErrorState error={error} onRetry={reload} /></PageWrap>;

  const licenses = data?.licenses || [];

  if (licenses.length === 0) {
    return (
      <PageWrap>
        <EmptyState
          icon="key"
          title="No active licenses"
          message="Your plan’s licenses will appear here once your subscription is active. Pick a product to activate it on a site."
        />
      </PageWrap>
    );
  }

  const deactivate = async (lic) => {
    try {
      await api.post('deactivate', { license_key: lic.key || lic.license_key, domain: lic.domain }, { ns: 'licenseistic' });
      toast('License deactivated.', 'success');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const columns = [
    { key: 'product', label: 'Product' },
    { key: 'plan', label: 'Plan' },
    { key: 'status', label: 'Status' },
    { key: 'domain', label: 'Domain' },
    { key: 'activations', label: 'Activations' },
    { key: 'expiry', label: 'Expiry' },
    { key: 'actions', label: '' },
  ];

  const renderCell = (key, row) => {
    switch (key) {
      case 'product':
        return <span style={{ fontWeight: 700, color: '#0D0F1A', textTransform: 'capitalize' }}>{row.product}</span>;
      case 'status':
        return <Badge tone={STATUS_TONE[row.status] || 'gray'} dot>{row.status}</Badge>;
      case 'domain':
        return <code style={{ fontSize: 12 }}>{row.domain || '—'}</code>;
      case 'actions':
        return boot.currentUser.caps?.manage_licenses
          ? <Btn variant="ghost-gray" size="xs" onClick={() => deactivate(row)}>Deactivate</Btn>
          : null;
      default:
        return row[key] ?? '—';
    }
  };

  return (
    <PageWrap>
      <Card padding={0}>
        <DataTable columns={columns} rows={licenses} renderCell={renderCell} empty="No licenses." />
      </Card>
    </PageWrap>
  );
}
