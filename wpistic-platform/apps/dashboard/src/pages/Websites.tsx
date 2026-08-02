import { useState } from 'react';
import { ExternalLink, Globe, Plus, Trash2 } from 'lucide-react';
import { useWebsites, useOrgMutation } from '../hooks/useApi';
import { api } from '../lib/api-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Modal,
  PageHeader,
  Skeleton,
  Table,
  Td,
  statusBadgeVariant,
} from '../components/ui';
import { relativeTime, titleCase } from '../lib/format';

export function Websites() {
  const websites = useWebsites();
  const [addOpen, setAddOpen] = useState(false);
  const [domain, setDomain] = useState('');
  const [name, setName] = useState('');
  const [connectionToken, setConnectionToken] = useState<string | null>(null);

  const addWebsite = useOrgMutation(['websites'], (orgId, input: { domain: string; name?: string }) =>
    api.addWebsite(orgId, input)
  );
  const disconnect = useOrgMutation(['websites'], (orgId, websiteId: string) =>
    api.disconnectWebsite(orgId, websiteId)
  );

  const submit = async () => {
    const result = await addWebsite.mutateAsync({ domain: domain.trim(), name: name.trim() || undefined });
    setConnectionToken(result.connection_token);
  };

  const close = () => {
    setAddOpen(false);
    setConnectionToken(null);
    setDomain('');
    setName('');
  };

  const rows = websites.data?.websites ?? [];

  return (
    <div>
      <PageHeader
        title="Websites"
        description="Every WordPress site connected to your organization, across all products."
        action={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add Website
          </Button>
        }
      />

      <Card>
        {websites.isLoading ? (
          <div className="p-5 space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Globe size={32} />}
            title="No websites yet"
            description="Connect a site from a WPistic plugin, or add it manually to get a connection token."
            action={
              <Button onClick={() => setAddOpen(true)}>
                <Plus size={14} /> Add Website
              </Button>
            }
          />
        ) : (
          <Table headers={['Domain', 'Environment', 'Status', 'Products', 'Versions', 'Last sync', '']}>
            {rows.map((site) => (
              <tr key={site.id} className="hover:bg-surface-hover/50 transition-colors">
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{site.domain}</span>
                    <a
                      href={`https://${site.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted hover:text-white"
                      title="Open site"
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>
                  {site.name && <p className="text-[12px] text-muted">{site.name}</p>}
                </Td>
                <Td>
                  <Badge>{titleCase(site.environment)}</Badge>
                </Td>
                <Td>
                  <Badge variant={site.is_connected ? 'success' : 'default'}>
                    {site.is_connected ? 'Connected' : 'Not connected'}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {site.installations.length === 0 ? (
                      <span className="text-muted text-[13px]">—</span>
                    ) : (
                      site.installations.map((inst) => (
                        <Badge key={inst.product} variant="accent">
                          {inst.product_name}
                        </Badge>
                      ))
                    )}
                  </div>
                </Td>
                <Td>
                  <span className="text-[13px] text-muted font-mono">
                    {site.wp_version ? `WP ${site.wp_version}` : '—'}
                    {site.php_version ? ` · PHP ${site.php_version}` : ''}
                  </span>
                </Td>
                <Td>
                  <span className="text-[13px] text-muted">{relativeTime(site.last_sync_at)}</span>
                </Td>
                <Td className="text-right">
                  <button
                    onClick={() => {
                      if (confirm(`Disconnect ${site.domain}? The site's connection token will be revoked.`)) {
                        void disconnect.mutateAsync(site.id);
                      }
                    }}
                    className="p-1.5 rounded-md text-muted hover:text-red-300 hover:bg-danger/10 transition-colors"
                    title="Disconnect"
                  >
                    <Trash2 size={14} />
                  </button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={addOpen}
        onClose={close}
        title={connectionToken ? 'Website added' : 'Add website'}
        footer={
          connectionToken ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={addWebsite.isPending || domain.trim().length < 3}>
                {addWebsite.isPending ? 'Adding…' : 'Add website'}
              </Button>
            </>
          )
        }
      >
        {connectionToken ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Paste this connection token into any WPistic plugin on the site (Settings → WPistic → Connect). It is
              shown only once.
            </p>
            <code className="block text-[13px] font-mono bg-background border border-border rounded-md px-3 py-2.5 break-all select-all">
              {connectionToken}
            </code>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Domain</Label>
              <Input placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} autoFocus />
            </div>
            <div>
              <Label>Name (optional)</Label>
              <Input placeholder="Client site" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {addWebsite.isError && (
              <p className="text-[13px] text-red-300">{(addWebsite.error as Error).message}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
