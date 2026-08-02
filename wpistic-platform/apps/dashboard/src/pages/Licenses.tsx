import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, RotateCw, Trash2 } from 'lucide-react';
import type { LicenseView } from '@wpistic/types';
import { useLicenses, useOrgMutation } from '../hooks/useApi';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Skeleton,
  Table,
  Td,
  statusBadgeVariant,
} from '../components/ui';
import { LicenseCard } from '../components/LicenseCard';
import { formatDate, relativeTime, titleCase } from '../lib/format';

export function Licenses() {
  const licenses = useLicenses();
  const orgId = useAuthStore((s) => s.currentOrgId);
  const [selected, setSelected] = useState<LicenseView | null>(null);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['license-detail', orgId, selected?.id],
    queryFn: () => api.getLicense(orgId!, selected!.id),
    enabled: orgId !== null && selected !== null,
  });

  const rotate = useOrgMutation(['licenses'], (org, licenseId: string) => api.rotateLicense(org, licenseId));
  const deactivate = useOrgMutation(['licenses'], (org, input: { licenseId: string; activationId: string }) =>
    api.deactivateActivation(org, input.licenseId, input.activationId)
  );

  const rows = licenses.data?.licenses ?? [];

  return (
    <div>
      <PageHeader title="Licenses" description="License keys, activations, and renewal state for every product." />

      {licenses.isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<KeyRound size={32} />}
            title="No licenses yet"
            description="Licenses are issued automatically when you purchase a WPistic plugin product."
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((license) => (
            <LicenseCard key={license.id} license={license} onClick={() => setSelected(license)} />
          ))}
        </div>
      )}

      <Modal
        open={selected !== null}
        onClose={() => {
          setSelected(null);
          setRotatedKey(null);
        }}
        title={selected ? `${selected.product_name} — ${titleCase(selected.plan)}` : ''}
      >
        {rotatedKey && (
          <div className="mb-4 p-3 rounded-lg border border-accent/40 bg-accent/5">
            <p className="text-[13px] text-accent font-medium mb-1.5">New key — copy it now, it is shown once:</p>
            <code className="block text-[12px] font-mono break-all select-all">{rotatedKey}</code>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-muted">
            {selected?.expires_at ? `Expires ${formatDate(selected.expires_at)}` : 'Never expires'}
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              if (!selected) return;
              if (confirm('Rotate this key? The old key stops working immediately on all sites.')) {
                const result = await rotate.mutateAsync(selected.id);
                setRotatedKey(result.key);
              }
            }}
            disabled={rotate.isPending}
          >
            <RotateCw size={13} /> Rotate key
          </Button>
        </div>

        <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wider mb-2">Activations</h3>
        {detail.isLoading ? (
          <Skeleton className="h-20" />
        ) : (detail.data?.activations ?? []).length === 0 ? (
          <p className="text-sm text-muted">No sites activated yet.</p>
        ) : (
          <Table headers={['Domain', 'Env', 'Status', 'Last seen', '']}>
            {(detail.data?.activations ?? []).map((act) => (
              <tr key={act.id}>
                <Td>
                  <span className="text-[13px] font-medium">{act.domain_normalized}</span>
                </Td>
                <Td>
                  <Badge>{titleCase(act.environment)}</Badge>
                </Td>
                <Td>
                  <Badge variant={statusBadgeVariant(act.status)}>{titleCase(act.status)}</Badge>
                </Td>
                <Td>
                  <span className="text-[12px] text-muted">{relativeTime(act.last_seen_at)}</span>
                </Td>
                <Td className="text-right">
                  {act.status === 'active' && (
                    <button
                      onClick={() => {
                        if (selected && confirm(`Deactivate ${act.domain_normalized}?`)) {
                          void deactivate
                            .mutateAsync({ licenseId: selected.id, activationId: act.id })
                            .then(() => detail.refetch());
                        }
                      }}
                      className="p-1.5 rounded-md text-muted hover:text-red-300 hover:bg-danger/10 transition-colors"
                      title="Deactivate site"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Modal>
    </div>
  );
}
