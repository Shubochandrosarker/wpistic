import { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import type { OrgRole } from '@wpistic/types';
import { ORG_ROLES } from '@wpistic/types';
import { useInvitations, useMembers, useOrgMutation } from '../hooks/useApi';
import { api } from '../lib/api-client';
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Table,
  Td,
  statusBadgeVariant,
} from '../components/ui';
import { formatDate, titleCase } from '../lib/format';

const ASSIGNABLE_ROLES = ORG_ROLES.filter((r) => r !== 'owner');

export function Team() {
  const members = useMembers();
  const invitations = useInvitations();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('member');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const invite = useOrgMutation(['invitations'], (orgId, input: { email: string; role: OrgRole }) =>
    api.invite(orgId, input)
  );
  const changeRole = useOrgMutation(['members'], (orgId, input: { id: string; role: OrgRole }) =>
    api.updateMember(orgId, input.id, { role: input.role })
  );
  const remove = useOrgMutation(['members'], (orgId, membershipId: string) => api.removeMember(orgId, membershipId));
  const revokeInvite = useOrgMutation(['invitations'], (orgId, invitationId: string) =>
    api.revokeInvitation(orgId, invitationId)
  );

  const submitInvite = async () => {
    const result = (await invite.mutateAsync({ email: email.trim(), role })) as unknown as {
      invite_url?: string;
    };
    setInviteUrl(result.invite_url ?? null);
  };

  return (
    <div>
      <PageHeader
        title="Team"
        description="Members and roles for this organization. Roles gate billing, product, and support access."
        action={
          <Button
            size="sm"
            onClick={() => {
              setInviteOpen(true);
              setInviteUrl(null);
              setEmail('');
            }}
          >
            <UserPlus size={14} /> Invite member
          </Button>
        }
      />

      <Card className="mb-6">
        {members.isLoading ? (
          <div className="p-5">
            <Skeleton className="h-24" />
          </div>
        ) : (
          <Table headers={['Member', 'Role', 'Status', 'Joined', '']}>
            {(members.data?.members ?? []).map((member) => (
              <tr key={member.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-surface-hover border border-border grid place-items-center text-[12px] font-semibold shrink-0">
                      {(member.first_name ?? member.email).charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate">
                        {[member.first_name, member.last_name].filter(Boolean).join(' ') || member.email}
                      </p>
                      <p className="text-[12px] text-muted truncate">{member.email}</p>
                    </div>
                  </div>
                </Td>
                <Td>
                  {member.role === 'owner' ? (
                    <Badge variant="accent">Owner</Badge>
                  ) : (
                    <Select
                      className="w-40 !py-1 text-[13px]"
                      value={member.role}
                      onChange={(e) => void changeRole.mutateAsync({ id: member.id, role: e.target.value as OrgRole })}
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {titleCase(r)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Td>
                <Td>
                  <Badge variant={statusBadgeVariant(member.status)}>{titleCase(member.status)}</Badge>
                </Td>
                <Td>
                  <span className="text-[13px] text-muted">{formatDate(member.joined_at)}</span>
                </Td>
                <Td className="text-right">
                  {member.role !== 'owner' && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${member.email} from the organization?`)) {
                          void remove.mutateAsync(member.id);
                        }
                      }}
                      className="p-1.5 rounded-md text-muted hover:text-red-300 hover:bg-danger/10 transition-colors"
                      title="Remove member"
                    >
                      <X size={14} />
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {(invitations.data?.invitations ?? []).length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Pending invitations</h2>
          <Card>
            <Table headers={['Email', 'Role', 'Expires', '']}>
              {(invitations.data?.invitations ?? []).map((inv) => (
                <tr key={inv.id}>
                  <Td>
                    <span className="text-[13px]">{inv.email}</span>
                  </Td>
                  <Td>
                    <Badge>{titleCase(inv.role)}</Badge>
                  </Td>
                  <Td>
                    <span className="text-[13px] text-muted">{formatDate(inv.expires_at)}</span>
                  </Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => void revokeInvite.mutateAsync(inv.id)}>
                      Revoke
                    </Button>
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        </section>
      )}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={inviteUrl ? 'Invitation created' : 'Invite a member'}
        footer={
          inviteUrl ? (
            <Button onClick={() => setInviteOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitInvite} disabled={invite.isPending || !email.includes('@')}>
                {invite.isPending ? 'Inviting…' : 'Send invitation'}
              </Button>
            </>
          )
        }
      >
        {inviteUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">Share this link with {email} — it expires in 7 days:</p>
            <code className="block text-[12px] font-mono bg-background border border-border rounded-md px-3 py-2.5 break-all select-all">
              {inviteUrl}
            </code>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {titleCase(r)}
                  </option>
                ))}
              </Select>
            </div>
            {invite.isError && <p className="text-[13px] text-red-300">{(invite.error as Error).message}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
