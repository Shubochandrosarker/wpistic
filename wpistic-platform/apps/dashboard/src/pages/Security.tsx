import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Monitor, Plus, ShieldCheck } from 'lucide-react';
import { useApiKeys, useOrgMutation, useSessions } from '../hooks/useApi';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth';
import { ACCOUNT_URL } from '../lib/config';
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Modal,
  PageHeader,
  Skeleton,
  Table,
  Td,
} from '../components/ui';
import { formatDateTime, relativeTime } from '../lib/format';

export function Security() {
  const sessions = useSessions();
  const apiKeys = useApiKeys();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const revokeSession = useMutation({
    mutationFn: (id: string) => api.revokeSession(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const revokeOthers = useMutation({
    mutationFn: () => api.revokeOtherSessions(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const createKey = useOrgMutation(['api-keys'], (orgId, input: { name: string }) => api.createApiKey(orgId, input));
  const revokeKey = useOrgMutation(['api-keys'], (orgId, keyId: string) => api.revokeApiKey(orgId, keyId));

  return (
    <div>
      <PageHeader title="Security" description="Sessions, multi-factor authentication, and API keys." />

      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck size={20} className={user?.mfa_enabled ? 'text-success' : 'text-muted'} />
            <div>
              <p className="font-medium text-sm">Multi-factor authentication</p>
              <p className="text-[13px] text-muted">
                {user?.mfa_enabled
                  ? 'Enabled — your account requires an authenticator code at sign-in.'
                  : 'Protect your account with an authenticator app.'}
              </p>
            </div>
          </div>
          <a href={`${ACCOUNT_URL}/login?continue=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noreferrer">
            <Button size="sm" variant={user?.mfa_enabled ? 'secondary' : 'primary'}>
              Manage on account.wpistic.com
            </Button>
          </a>
        </div>
      </Card>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">Active sessions</h2>
          <Button size="sm" variant="secondary" onClick={() => void revokeOthers.mutateAsync()}>
            Revoke all other sessions
          </Button>
        </div>
        <Card>
          {sessions.isLoading ? (
            <div className="p-5">
              <Skeleton className="h-24" />
            </div>
          ) : (
            <Table headers={['Device', 'IP address', 'Started', '']}>
              {(sessions.data?.sessions ?? []).map((session) => (
                <tr key={session.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Monitor size={15} className="text-muted shrink-0" />
                      <span className="text-[13px] truncate max-w-[280px]">
                        {session.user_agent?.slice(0, 60) ?? 'Unknown device'}
                      </span>
                      {session.current && <Badge variant="accent">This device</Badge>}
                    </div>
                  </Td>
                  <Td>
                    <span className="text-[13px] font-mono text-muted">{session.ip_address ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="text-[13px] text-muted">{formatDateTime(session.created_at)}</span>
                  </Td>
                  <Td className="text-right">
                    {!session.current && (
                      <Button size="sm" variant="ghost" onClick={() => void revokeSession.mutateAsync(session.id)}>
                        Revoke
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">API keys</h2>
          <Button
            size="sm"
            onClick={() => {
              setKeyModalOpen(true);
              setCreatedKey(null);
              setKeyName('');
            }}
          >
            <Plus size={14} /> Create key
          </Button>
        </div>
        <Card>
          {apiKeys.isLoading ? (
            <div className="p-5">
              <Skeleton className="h-16" />
            </div>
          ) : (apiKeys.data?.keys ?? []).length === 0 ? (
            <p className="p-5 text-sm text-muted">
              No API keys. Create one for server-to-server access to the platform API.
            </p>
          ) : (
            <Table headers={['Name', 'Key', 'Last used', '']}>
              {(apiKeys.data?.keys ?? []).map((key) => (
                <tr key={key.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <KeyRound size={14} className="text-muted" />
                      <span className="text-[13px] font-medium">{key.name}</span>
                    </div>
                  </Td>
                  <Td>
                    <code className="text-[12px] font-mono text-muted">{key.key_mask}</code>
                  </Td>
                  <Td>
                    <span className="text-[13px] text-muted">{relativeTime(key.last_used_at)}</span>
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Revoke API key "${key.name}"?`)) void revokeKey.mutateAsync(key.id);
                      }}
                    >
                      Revoke
                    </Button>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </section>

      <Modal
        open={keyModalOpen}
        onClose={() => setKeyModalOpen(false)}
        title={createdKey ? 'API key created' : 'Create API key'}
        footer={
          createdKey ? (
            <Button onClick={() => setKeyModalOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setKeyModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const result = await createKey.mutateAsync({ name: keyName.trim() });
                  setCreatedKey(result.key);
                }}
                disabled={createKey.isPending || keyName.trim().length === 0}
              >
                {createKey.isPending ? 'Creating…' : 'Create key'}
              </Button>
            </>
          )
        }
      >
        {createdKey ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">Copy this key now — it is shown only once:</p>
            <code className="block text-[12px] font-mono bg-background border border-border rounded-md px-3 py-2.5 break-all select-all">
              {createdKey}
            </code>
          </div>
        ) : (
          <div>
            <Label>Key name</Label>
            <Input placeholder="CI deploys" value={keyName} onChange={(e) => setKeyName(e.target.value)} autoFocus />
          </div>
        )}
      </Modal>
    </div>
  );
}
