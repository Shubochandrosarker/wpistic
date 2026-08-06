/**
 * License detail management: plan change (upgrade / downgrade), seat count,
 * expiry, and transfer between organizations.
 *
 * Downgrades are the case worth being careful about. When the target plan
 * allows fewer seats than the license currently has activated, the API refuses
 * by default. The operator has to opt in to freeing the newest activations —
 * that choice is surfaced here as an explicit checkbox rather than being made
 * silently on their behalf.
 */
import { useState } from 'react';
import { adminCall, describeError } from '../lib/client';
import { Button, Field, INPUT, Panel, Status, useReloadAfter } from './admin-ui';

export interface LicenseDetail {
  id: string;
  key_mask: string;
  status: string;
  product: string;
  plan: string;
  organization: string;
  organization_id: string;
  max_activations: number;
  active_activations: number;
  expires_at: string | null;
}

export default function LicenseManager({
  license,
  planOptions,
}: {
  license: LicenseDetail;
  planOptions: string[];
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

  const [planChange, setPlanChange] = useState({ plan_slug: license.plan, force: false });
  const [seats, setSeats] = useState({ max_activations: license.max_activations, force: false });
  const [expiry, setExpiry] = useState({ mode: 'add_days' as 'add_days' | 'absolute' | 'perpetual', add_days: 365, expires_at: '' });
  const [transferTo, setTransferTo] = useState('');

  const downgrading = planChange.plan_slug !== license.plan;

  return (
    <>
      <Panel
        title="Plan"
        description={`Currently "${license.plan}" on ${license.product}. Changing plan re-resolves this organization's entitlements immediately.`}
      >
        <div className="flex items-end gap-3">
          <div className="w-48">
            <Field label="Move to plan">
              <select
                className={INPUT}
                value={planChange.plan_slug}
                onChange={(e) => setPlanChange({ ...planChange, plan_slug: e.target.value })}
              >
                {planOptions.map((slug) => (
                  <option key={slug} value={slug}>{slug}</option>
                ))}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-[#A1A1A1] pb-2">
            <input type="checkbox" checked={planChange.force} onChange={(e) => setPlanChange({ ...planChange, force: e.target.checked })} />
            Free the newest sites if the new plan allows fewer
          </label>
          <div className="pb-1">
            <Button
              variant="primary"
              disabled={busy || !downgrading}
              onClick={() =>
                void run(
                  () =>
                    adminCall(`/licensing/${license.id}/change-plan`, {
                      reason: `Move ${license.key_mask} from "${license.plan}" to "${planChange.plan_slug}"`,
                      body: {
                        plan_slug: planChange.plan_slug,
                        over_limit: planChange.force ? 'deactivate_newest' : 'refuse',
                      },
                    }),
                  `Moved to ${planChange.plan_slug}.`
                )
              }
            >
              Change plan
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted mt-3">
          Seats follow the new plan's <code className="font-mono">{license.product}.sites.max</code> entitlement unless
          you set them explicitly below.
        </p>
      </Panel>

      <Panel
        title="Seats"
        description={`${license.active_activations} of ${license.max_activations} production activations in use.`}
      >
        <div className="flex items-end gap-3">
          <div className="w-32">
            <Field label="Max activations">
              <input
                className={INPUT}
                type="number"
                min={1}
                value={seats.max_activations}
                onChange={(e) => setSeats({ ...seats, max_activations: Number(e.target.value) })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-[#A1A1A1] pb-2">
            <input type="checkbox" checked={seats.force} onChange={(e) => setSeats({ ...seats, force: e.target.checked })} />
            Free the newest sites if reducing below current usage
          </label>
          <div className="pb-1">
            <Button
              disabled={busy || seats.max_activations === license.max_activations}
              onClick={() =>
                void run(
                  () =>
                    adminCall(`/licensing/${license.id}/seats`, {
                      reason: `Change ${license.key_mask} seats from ${license.max_activations} to ${seats.max_activations}`,
                      body: {
                        max_activations: seats.max_activations,
                        over_limit: seats.force ? 'deactivate_newest' : 'refuse',
                      },
                    }),
                  'Seats updated.'
                )
              }
            >
              Update seats
            </Button>
          </div>
        </div>
      </Panel>

      <Panel
        title="Expiry"
        description={license.expires_at ? `Expires ${new Date(license.expires_at).toLocaleDateString()}.` : 'Perpetual — no expiry date.'}
      >
        <div className="flex items-end gap-3">
          <div className="w-40">
            <Field label="Mode">
              <select className={INPUT} value={expiry.mode} onChange={(e) => setExpiry({ ...expiry, mode: e.target.value as typeof expiry.mode })}>
                <option value="add_days">Extend by days</option>
                <option value="absolute">Set a date</option>
                <option value="perpetual">Make perpetual</option>
              </select>
            </Field>
          </div>
          {expiry.mode === 'add_days' && (
            <div className="w-28">
              <Field label="Days">
                <input className={INPUT} type="number" min={1} value={expiry.add_days} onChange={(e) => setExpiry({ ...expiry, add_days: Number(e.target.value) })} />
              </Field>
            </div>
          )}
          {expiry.mode === 'absolute' && (
            <div className="w-44">
              <Field label="New expiry">
                <input className={INPUT} type="date" value={expiry.expires_at} onChange={(e) => setExpiry({ ...expiry, expires_at: e.target.value })} />
              </Field>
            </div>
          )}
          <div className="pb-1">
            <Button
              disabled={busy || (expiry.mode === 'absolute' && !expiry.expires_at)}
              onClick={() =>
                void run(
                  () =>
                    adminCall(`/licensing/${license.id}/extend`, {
                      reason: `Change expiry on ${license.key_mask}`,
                      body:
                        expiry.mode === 'add_days'
                          ? { add_days: expiry.add_days }
                          : expiry.mode === 'perpetual'
                            ? { expires_at: null }
                            : // <input type="date"> gives a bare date; the API wants a timestamp.
                              { expires_at: new Date(`${expiry.expires_at}T23:59:59Z`).toISOString() },
                    }),
                  'Expiry updated.'
                )
              }
            >
              Apply
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted mt-3">
          Extending clears any pinned grace-period deadline and reactivates a license that had lapsed to expired.
        </p>
      </Panel>

      <Panel
        title="Transfer"
        description={`Owned by ${license.organization}. Transferring moves the license and its activations to another organization.`}
      >
        <div className="flex items-end gap-3">
          <div className="w-96">
            <Field label="Destination organization id" hint="Every activated site must reactivate afterwards — their current tokens stop working.">
              <input className={INPUT} value={transferTo} onChange={(e) => setTransferTo(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
            </Field>
          </div>
          <div className="pb-1">
            <Button
              variant="danger"
              disabled={busy || !transferTo}
              onClick={() =>
                void run(
                  () =>
                    adminCall(`/licensing/${license.id}/transfer`, {
                      mfa: true,
                      reason: `Transfer ${license.key_mask} away from ${license.organization}? Every activated site must reactivate.`,
                      body: { organization_id: transferTo.trim() },
                    }),
                  'License transferred.'
                )
              }
            >
              Transfer license
            </Button>
          </div>
        </div>
      </Panel>

      <Status error={error} message={message} />
    </>
  );
}
