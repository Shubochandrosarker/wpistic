/**
 * Organization detail management: profile, status, product access grants, and
 * membership.
 *
 * Grants are the upgrade/downgrade control for anything not bought through
 * Stripe. Changing a grant's plan re-points entitlement resolution at the new
 * plan's entitlements — that single change is the whole upgrade.
 */
import { useState } from 'react';
import { adminCall, describeError } from '../lib/client';
import { Button, Field, INPUT, Panel, Status, useReloadAfter } from './admin-ui';

export interface Grant {
  id: string;
  product: string;
  product_name: string;
  plan: string;
  plan_name: string;
  source: string;
  status: string;
  ends_at: string | null;
  limit_overrides: Record<string, unknown>;
}

export interface Member {
  id: string;
  role: string;
  status: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  billing_email: string | null;
  status: string;
}

export interface CatalogOption {
  slug: string;
  name: string;
  plans: string[];
}

const ORG_ROLES = ['owner', 'admin', 'billing_manager', 'product_manager', 'support_manager', 'member', 'viewer'];

export default function OrgManager({
  organization,
  grants,
  members,
  catalog,
}: {
  organization: Organization;
  grants: Grant[];
  members: Member[];
  catalog: CatalogOption[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useReloadAfter(message);

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

  // ---- profile -------------------------------------------------------------
  const [profile, setProfile] = useState({
    name: organization.name,
    slug: organization.slug,
    billing_email: organization.billing_email ?? '',
  });

  // ---- new grant -----------------------------------------------------------
  const [grantDraft, setGrantDraft] = useState({ product_slug: catalog[0]?.slug ?? '', plan_slug: '' });
  const grantPlans = catalog.find((p) => p.slug === grantDraft.product_slug)?.plans ?? [];

  // ---- new member ----------------------------------------------------------
  const [memberDraft, setMemberDraft] = useState({ email: '', role: 'member' });

  return (
    <>
      <Panel title="Profile" description={`Organization ${organization.slug} · status ${organization.status}`}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Name">
            <input className={INPUT} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </Field>
          <Field label="Slug">
            <input className={INPUT} value={profile.slug} onChange={(e) => setProfile({ ...profile, slug: e.target.value })} />
          </Field>
          <Field label="Billing email">
            <input className={INPUT} value={profile.billing_email} onChange={(e) => setProfile({ ...profile, billing_email: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  adminCall(`/tenancy/organizations/${organization.id}`, {
                    method: 'PATCH',
                    body: { name: profile.name, slug: profile.slug, billing_email: profile.billing_email || null },
                  }),
                'Profile saved.'
              )
            }
          >
            Save profile
          </Button>
          {organization.status === 'active' ? (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    adminCall(`/tenancy/organizations/${organization.id}/status`, {
                      mfa: true,
                      reason: `Suspend "${organization.name}"? Members are signed out immediately. Licenses keep validating — suspend those separately if that is the intent.`,
                      body: { status: 'suspended' },
                    }),
                  'Organization suspended.'
                )
              }
            >
              Suspend organization
            </Button>
          ) : (
            <Button
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    adminCall(`/tenancy/organizations/${organization.id}/status`, {
                      mfa: true,
                      reason: `Reactivate "${organization.name}"?`,
                      body: { status: 'active' },
                    }),
                  'Organization reactivated.'
                )
              }
            >
              Reactivate
            </Button>
          )}
        </div>
      </Panel>

      <Panel
        title="Product access"
        description="Grants entitle this organization to a product outside of paid billing. Changing the plan is an upgrade or downgrade."
      >
        <div className="flex items-end gap-3 mb-5 border border-border rounded-xl p-3 bg-background/40">
          <div className="w-52">
            <Field label="Product">
              <select
                className={INPUT}
                value={grantDraft.product_slug}
                onChange={(e) => setGrantDraft({ product_slug: e.target.value, plan_slug: '' })}
              >
                {catalog.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="w-40">
            <Field label="Plan">
              <select className={INPUT} value={grantDraft.plan_slug} onChange={(e) => setGrantDraft({ ...grantDraft, plan_slug: e.target.value })}>
                <option value="">— select —</option>
                {grantPlans.map((slug) => (
                  <option key={slug} value={slug}>{slug}</option>
                ))}
              </select>
            </Field>
          </div>
          <Button
            disabled={busy || !grantDraft.plan_slug}
            onClick={() =>
              void run(
                () =>
                  adminCall(`/tenancy/organizations/${organization.id}/grants`, {
                    reason: `Grant ${grantDraft.product_slug} (${grantDraft.plan_slug}) to ${organization.name}`,
                    body: { product_slug: grantDraft.product_slug, plan_slug: grantDraft.plan_slug, source: 'manual' },
                  }),
                'Access granted.'
              )
            }
          >
            Grant access
          </Button>
        </div>

        {grants.length === 0 ? (
          <p className="text-[13px] text-muted">No access grants.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[13px] text-muted">
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {grants.map((grant) => {
                const options = catalog.find((p) => p.slug === grant.product)?.plans ?? [];
                return (
                  <tr key={grant.id}>
                    <td className="px-3 py-2.5">{grant.product_name}</td>
                    <td className="px-3 py-2.5">
                      <select
                        className={`${INPUT} w-32`}
                        defaultValue={grant.plan}
                        disabled={busy || grant.status !== 'active'}
                        onChange={(e) => {
                          const planSlug = e.target.value;
                          if (planSlug === grant.plan) return;
                          void run(
                            () =>
                              adminCall(`/tenancy/organizations/${organization.id}/grants/${grant.id}`, {
                                method: 'PATCH',
                                reason: `Move ${grant.product} from "${grant.plan}" to "${planSlug}"`,
                                body: { plan_slug: planSlug },
                              }),
                            `${grant.product} moved to ${planSlug}.`
                          );
                        }}
                      >
                        {options.map((slug) => (
                          <option key={slug} value={slug}>{slug}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-[#A1A1A1]">{grant.source.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2.5 text-[13px] text-[#A1A1A1]">{grant.status}</td>
                    <td className="px-3 py-2.5 text-right">
                      {grant.status === 'active' && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                adminCall(`/tenancy/organizations/${organization.id}/grants/${grant.id}`, {
                                  method: 'DELETE',
                                  mfa: true,
                                  reason: `Revoke ${grant.product} access from ${organization.name}?`,
                                }),
                              'Access revoked.'
                            )
                          }
                          className="text-[12px] px-2 py-1 rounded-md text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Members" description="Roles decide what a customer's own users may do inside their organization.">
        <div className="flex items-end gap-3 mb-5 border border-border rounded-xl p-3 bg-background/40">
          <div className="w-64">
            <Field label="Email" hint="The person must already have a WPistic account.">
              <input className={INPUT} value={memberDraft.email} onChange={(e) => setMemberDraft({ ...memberDraft, email: e.target.value })} />
            </Field>
          </div>
          <div className="w-44">
            <Field label="Role">
              <select className={INPUT} value={memberDraft.role} onChange={(e) => setMemberDraft({ ...memberDraft, role: e.target.value })}>
                {ORG_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
          </div>
          <Button
            disabled={busy || !memberDraft.email}
            onClick={() =>
              void run(
                () =>
                  adminCall(`/tenancy/organizations/${organization.id}/members`, {
                    reason: `Add ${memberDraft.email} to ${organization.name} as ${memberDraft.role}`,
                    body: { email: memberDraft.email.trim(), role: memberDraft.role },
                  }),
                'Member added.'
              )
            }
          >
            Add member
          </Button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[13px] text-muted">
              <th className="px-3 py-2 font-medium">Person</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {members.map((member) => (
              <tr key={member.id}>
                <td className="px-3 py-2.5">
                  {[member.first_name, member.last_name].filter(Boolean).join(' ') || '—'}
                  <span className="block text-[12px] text-muted">{member.email}</span>
                </td>
                <td className="px-3 py-2.5">
                  <select
                    className={`${INPUT} w-40`}
                    defaultValue={member.role}
                    disabled={busy}
                    onChange={(e) => {
                      const role = e.target.value;
                      if (role === member.role) return;
                      void run(
                        () =>
                          adminCall(`/tenancy/organizations/${organization.id}/members/${member.id}`, {
                            method: 'PATCH',
                            reason: `Change ${member.email} from ${member.role} to ${role}`,
                            body: { role },
                          }),
                        'Role updated.'
                      );
                    }}
                  >
                    {ORG_ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2.5 text-[13px] text-[#A1A1A1]">{member.status}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          adminCall(`/tenancy/organizations/${organization.id}/members/${member.id}`, {
                            method: 'DELETE',
                            mfa: true,
                            reason: `Remove ${member.email} from ${organization.name}?`,
                          }),
                        'Member removed.'
                      )
                    }
                    className="text-[12px] px-2 py-1 rounded-md text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Status error={error} message={message} />
    </>
  );
}
