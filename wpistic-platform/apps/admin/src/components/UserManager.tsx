/**
 * User administration: search, suspend/reactivate, MFA reset, session revoke,
 * and issuing a password-reset link.
 *
 * The reset link is returned to the operator rather than emailed, because
 * transactional delivery is still gated behind EMAIL_WEBHOOK_URL. It is
 * single-use and expires in an hour — hand it over through a channel where the
 * customer's identity is already established, never by replying to whoever
 * asked for it.
 */
import { useMemo, useState } from 'react';
import { adminCall, describeError } from '../lib/client';
import { INPUT, Panel, SecretReveal, Status, useReloadAfter } from './admin-ui';

export interface AdminUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  mfa_enabled: boolean;
  organization_count: number;
  last_login_at: string | null;
  created_at: string;
}

export default function UserManager({ users }: { users: AdminUser[] }) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<{ email: string; url: string } | null>(null);

  // Suppress the auto-reload while a one-shot reset link is on screen — a
  // reload would destroy the only copy of it.
  useReloadAfter(resetLink ? null : message);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.email, u.first_name, u.last_name].some((v) => (v ?? '').toLowerCase().includes(q))
    );
  }, [users, query]);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMessage(`${success} Reloading…`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const issueReset = async (user: AdminUser) => {
    setBusy(true);
    setError(null);
    try {
      const result = await adminCall<{ reset_url: string; email: string }>(`/tenancy/users/${user.id}/password-reset`, {
        reason: `Issue a password reset link for ${user.email}? Verify their identity through a trusted channel first.`,
      });
      setResetLink({ email: result.email, url: result.reset_url });
      setMessage(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Users" description={`${users.length} accounts. Search by name or email.`}>
      {resetLink && (
        <SecretReveal
          label={`Password reset link for ${resetLink.email} — valid for 1 hour, single use`}
          value={resetLink.url}
          onDismiss={() => {
            setResetLink(null);
            window.location.reload();
          }}
        />
      )}

      <input
        className={`${INPUT} max-w-sm mb-4`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search users…"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[13px] text-muted">
              <th className="px-3 py-2 font-medium">Person</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">MFA</th>
              <th className="px-3 py-2 font-medium">Orgs</th>
              <th className="px-3 py-2 font-medium">Last login</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  No matching users
                </td>
              </tr>
            )}
            {filtered.map((user) => (
              <tr key={user.id} className="hover:bg-surface-hover/50 transition-colors">
                <td className="px-3 py-2.5">
                  {[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}
                  <span className="block text-[12px] text-muted">{user.email}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full border text-[12px] ${
                      user.status === 'active'
                        ? 'bg-green-500/10 text-green-300 border-green-500/30'
                        : 'bg-red-500/10 text-red-300 border-red-500/30'
                    }`}
                  >
                    {user.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[13px] text-[#A1A1A1]">{user.mfa_enabled ? 'on' : 'off'}</td>
                <td className="px-3 py-2.5 text-[13px] text-[#A1A1A1]">{user.organization_count}</td>
                <td className="px-3 py-2.5 text-[13px] text-[#A1A1A1]">
                  {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <button
                    disabled={busy}
                    onClick={() => void issueReset(user)}
                    className="text-[12px] px-2 py-1 rounded-md text-[#A1A1A1] hover:text-white hover:bg-surface-hover disabled:opacity-50"
                  >
                    Reset link
                  </button>
                  {user.mfa_enabled && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            adminCall(`/tenancy/users/${user.id}/reset-mfa`, {
                              mfa: true,
                              reason: `Clear MFA for ${user.email}? Their next sign-in needs no code until they re-enrol. Verify identity first.`,
                            }),
                          'MFA cleared.'
                        )
                      }
                      className="text-[12px] px-2 py-1 rounded-md text-[#A1A1A1] hover:text-white hover:bg-surface-hover disabled:opacity-50"
                    >
                      Clear MFA
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          adminCall(`/tenancy/users/${user.id}/revoke-sessions`, {
                            reason: `Sign ${user.email} out of every device?`,
                          }),
                        'Sessions revoked.'
                      )
                    }
                    className="text-[12px] px-2 py-1 rounded-md text-[#A1A1A1] hover:text-white hover:bg-surface-hover disabled:opacity-50"
                  >
                    Sign out
                  </button>
                  {user.status === 'active' ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            adminCall(`/tenancy/users/${user.id}/status`, {
                              mfa: true,
                              reason: `Suspend ${user.email}? They are signed out and cannot sign back in.`,
                              body: { status: 'suspended' },
                            }),
                          'User suspended.'
                        )
                      }
                      className="text-[12px] px-2 py-1 rounded-md text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Suspend
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            adminCall(`/tenancy/users/${user.id}/status`, {
                              mfa: true,
                              reason: `Reactivate ${user.email}?`,
                              body: { status: 'active' },
                            }),
                          'User reactivated.'
                        )
                      }
                      className="text-[12px] px-2 py-1 rounded-md text-[#A1A1A1] hover:text-white hover:bg-surface-hover disabled:opacity-50"
                    >
                      Reactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Status error={error} message={message} />
    </Panel>
  );
}
