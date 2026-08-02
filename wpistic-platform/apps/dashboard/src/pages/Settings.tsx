import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentOrg } from '../hooks/useAuth';
import { useNotifications, useOrgMutation } from '../hooks/useApi';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth';
import { Badge, Button, Card, Input, Label, PageHeader, Table, Td } from '../components/ui';
import { formatDateTime, titleCase } from '../lib/format';

export function Settings() {
  const org = useCurrentOrg();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const notifications = useNotifications();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [billingEmail, setBillingEmail] = useState('');

  useEffect(() => {
    setFirstName(user?.first_name ?? '');
    setLastName(user?.last_name ?? '');
  }, [user]);
  useEffect(() => {
    setOrgName(org?.name ?? '');
    setBillingEmail(org?.billing_email ?? '');
  }, [org]);

  const saveProfile = useMutation({
    mutationFn: () => api.updateMe({ first_name: firstName, last_name: lastName }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
  const saveOrg = useOrgMutation([], (orgId) =>
    api.updateOrganization(orgId, { name: orgName, billing_email: billingEmail || null })
  );
  const markAllRead = useOrgMutation(['notifications'], (orgId) =>
    api.request(`/organizations/${orgId}/notifications/read-all`, { method: 'POST' })
  );

  return (
    <div>
      <PageHeader title="Settings" description="Profile, organization, and notification preferences." />

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Card className="p-5">
          <h2 className="font-semibold mb-4">Profile</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <Label>Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input value={user?.email ?? ''} disabled className="opacity-60" />
            </div>
            <Button size="sm" onClick={() => void saveProfile.mutateAsync()} disabled={saveProfile.isPending}>
              {saveProfile.isPending ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Organization</h2>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </div>
            <div>
              <Label>Billing email</Label>
              <Input
                type="email"
                placeholder="billing@example.com"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
              />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={org?.slug ?? ''} disabled className="opacity-60 font-mono" />
            </div>
            <Button size="sm" onClick={() => void saveOrg.mutateAsync(undefined as never)} disabled={saveOrg.isPending}>
              {saveOrg.isPending ? 'Saving…' : 'Save organization'}
            </Button>
          </div>
        </Card>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">Notifications</h2>
          <Button size="sm" variant="secondary" onClick={() => void markAllRead.mutateAsync(undefined as never)}>
            Mark all read
          </Button>
        </div>
        <Card>
          {(notifications.data?.notifications ?? []).length === 0 ? (
            <p className="p-5 text-sm text-muted">You're all caught up.</p>
          ) : (
            <Table headers={['', 'Notification', 'When']}>
              {(notifications.data?.notifications ?? []).slice(0, 20).map((n) => (
                <tr key={n.id} className={n.read_at ? 'opacity-60' : ''}>
                  <Td className="w-24">
                    <Badge
                      variant={n.severity === 'critical' ? 'danger' : n.severity === 'warning' ? 'warning' : 'info'}
                    >
                      {titleCase(n.severity)}
                    </Badge>
                  </Td>
                  <Td>
                    <p className="text-[13px] font-medium">{n.title}</p>
                    {n.body && <p className="text-[12px] text-muted mt-0.5">{n.body}</p>}
                  </Td>
                  <Td>
                    <span className="text-[12px] text-muted whitespace-nowrap">{formatDateTime(n.created_at)}</span>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </section>
    </div>
  );
}
