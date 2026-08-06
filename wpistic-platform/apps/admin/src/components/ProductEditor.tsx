/**
 * Single-product editor: settings, plans, prices, features, and the plan ×
 * feature entitlement grid.
 *
 * The entitlement grid is the part that actually decides what a customer's
 * plugin may do. Every cell is a `plan_entitlements` row, and the grid is
 * saved as a whole-plan replace so clearing a cell genuinely removes the
 * entitlement rather than leaving a stale row behind.
 */
import { useState } from 'react';
import { adminCall, describeError } from '../lib/client';
import { Button, Field, INPUT, Panel, Status, useReloadAfter } from './admin-ui';

export interface Feature {
  id: string;
  key: string;
  name: string;
  type: 'boolean' | 'number' | 'string' | 'list';
  description: string | null;
}

export interface Price {
  id: string;
  amount: number;
  currency: string;
  interval: string | null;
  trial_days: number;
  is_default: boolean;
  status: string;
}

export interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_public: boolean;
  sort_order: number;
  status: string;
  prices: Price[];
  entitlements: Array<{ feature_id: string; key: string; name: string; type: string; value: unknown }>;
  active_licenses: number;
  active_grants: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: string;
  catalog_state: string;
  acquisition_mode: string;
  public_visibility: boolean;
  compliance_hold: boolean;
  featured_order: number;
  marketing_url: string | null;
  app_url: string | null;
  icon_url: string | null;
  free_plan_id: string | null;
  free_limits: Record<string, unknown>;
}

/** Render an entitlement value for its declared feature type. */
function valueToInput(type: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (type === 'boolean') return value === true ? 'true' : 'false';
  if (type === 'list') return Array.isArray(value) ? value.join(', ') : String(value);
  return String(value);
}

function inputToValue(type: string, raw: string): unknown | undefined {
  const text = raw.trim();
  if (text === '') return undefined; // cleared → drop the entitlement entirely
  if (type === 'boolean') return text === 'true';
  if (type === 'number') {
    const n = Number(text);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === 'list') return text.split(',').map((s) => s.trim()).filter(Boolean);
  return text;
}

export default function ProductEditor({
  product,
  plans,
  features,
}: {
  product: Product;
  plans: Plan[];
  features: Feature[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useReloadAfter(message);

  const run = async (fn: () => Promise<void>, success: string) => {
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

  // ---- product settings ----------------------------------------------------
  const [settings, setSettings] = useState({
    name: product.name,
    description: product.description ?? '',
    catalog_state: product.catalog_state,
    acquisition_mode: product.acquisition_mode,
    public_visibility: product.public_visibility,
    compliance_hold: product.compliance_hold,
    featured_order: product.featured_order,
    marketing_url: product.marketing_url ?? '',
    app_url: product.app_url ?? '',
    free_plan_id: product.free_plan_id ?? '',
    free_limits: JSON.stringify(product.free_limits ?? {}, null, 0),
  });

  const saveSettings = () =>
    run(async () => {
      let freeLimits: Record<string, unknown>;
      try {
        freeLimits = JSON.parse(settings.free_limits || '{}') as Record<string, unknown>;
      } catch {
        throw new Error('Free limits must be valid JSON');
      }
      await adminCall(`/catalog/products/${product.id}`, {
        method: 'PATCH',
        body: {
          name: settings.name,
          description: settings.description || null,
          catalog_state: settings.catalog_state,
          acquisition_mode: settings.acquisition_mode,
          public_visibility: settings.public_visibility,
          compliance_hold: settings.compliance_hold,
          featured_order: Number(settings.featured_order) || 0,
          marketing_url: settings.marketing_url.trim() || null,
          app_url: settings.app_url.trim() || null,
          free_plan_id: settings.free_plan_id || null,
          free_limits: freeLimits,
        },
      });
    }, 'Settings saved.');

  // ---- new plan ------------------------------------------------------------
  const [newPlan, setNewPlan] = useState({ slug: '', name: '' });
  const createPlan = () =>
    run(async () => {
      await adminCall(`/catalog/products/${product.id}/plans`, {
        body: { slug: newPlan.slug.trim(), name: newPlan.name.trim(), sort_order: plans.length },
      });
    }, `Plan "${newPlan.slug}" created.`);

  // ---- new feature ---------------------------------------------------------
  const [newFeature, setNewFeature] = useState({ key: '', name: '', type: 'boolean' });
  const createFeature = () =>
    run(async () => {
      await adminCall(`/catalog/products/${product.id}/features`, {
        body: {
          key: newFeature.key.trim().startsWith(`${product.slug}.`)
            ? newFeature.key.trim()
            : `${product.slug}.${newFeature.key.trim()}`,
          name: newFeature.name.trim(),
          type: newFeature.type,
        },
      });
    }, 'Feature created.');

  // ---- new price -----------------------------------------------------------
  const [priceDraft, setPriceDraft] = useState<Record<string, { amount: string; interval: string }>>({});

  const draftFor = (planId: string) => priceDraft[planId] ?? { amount: '', interval: 'month' };
  const setDraft = (planId: string, patch: Partial<{ amount: string; interval: string }>) =>
    setPriceDraft((current) => ({ ...current, [planId]: { ...draftFor(planId), ...patch } }));

  const createPrice = (planId: string) =>
    run(async () => {
      const draft = draftFor(planId);
      await adminCall(`/catalog/plans/${planId}/prices`, {
        body: {
          // Stored in cents; the field is in whole currency units.
          amount: Math.round(Number(draft.amount || '0') * 100),
          interval: draft.interval === 'one_time' ? null : draft.interval,
          is_default: true,
        },
      });
    }, 'Price added.');

  // ---- entitlement grid ----------------------------------------------------
  const [grid, setGrid] = useState<Record<string, Record<string, string>>>(() => {
    const initial: Record<string, Record<string, string>> = {};
    for (const plan of plans) {
      initial[plan.id] = {};
      for (const feature of features) {
        const entry = plan.entitlements.find((e) => e.feature_id === feature.id);
        initial[plan.id]![feature.id] = valueToInput(feature.type, entry?.value);
      }
    }
    return initial;
  });

  const saveEntitlements = (plan: Plan) =>
    run(async () => {
      const cells = grid[plan.id] ?? {};
      const entitlements = features
        .map((feature) => ({ feature_id: feature.id, value: inputToValue(feature.type, cells[feature.id] ?? '') }))
        .filter((e) => e.value !== undefined);
      await adminCall(`/catalog/plans/${plan.id}/entitlements`, { method: 'PUT', body: { entitlements } });
    }, `Entitlements saved for "${plan.slug}".`);

  return (
    <>
      <Panel title="Settings" description={`Product ${product.slug} · ${product.type}`}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input className={INPUT} value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
          </Field>
          <Field label="Featured order" hint="Lower sorts first in the public catalog.">
            <input className={INPUT} type="number" value={settings.featured_order} onChange={(e) => setSettings({ ...settings, featured_order: Number(e.target.value) })} />
          </Field>
          <Field label="Catalog state">
            <select className={INPUT} value={settings.catalog_state} onChange={(e) => setSettings({ ...settings, catalog_state: e.target.value })}>
              {['draft', 'coming_soon', 'beta', 'live', 'retired'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Acquisition mode">
            <select className={INPUT} value={settings.acquisition_mode} onChange={(e) => setSettings({ ...settings, acquisition_mode: e.target.value })}>
              {['free_claim', 'paid', 'invite_only', 'compliance_hold'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Free plan" hint="Required when acquisition mode is free_claim — this is the plan a claim grants.">
            <select className={INPUT} value={settings.free_plan_id} onChange={(e) => setSettings({ ...settings, free_plan_id: e.target.value })}>
              <option value="">— none —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.slug}</option>
              ))}
            </select>
          </Field>
          <Field label="Free limits (JSON)" hint="Shown to customers on the claim; advisory copy, not enforcement.">
            <input className={INPUT} value={settings.free_limits} onChange={(e) => setSettings({ ...settings, free_limits: e.target.value })} />
          </Field>
          <Field label="Marketing URL">
            <input className={INPUT} value={settings.marketing_url} onChange={(e) => setSettings({ ...settings, marketing_url: e.target.value })} />
          </Field>
          <Field label="App URL">
            <input className={INPUT} value={settings.app_url} onChange={(e) => setSettings({ ...settings, app_url: e.target.value })} />
          </Field>
          <div className="col-span-2">
            <Field label="Description">
              <textarea className={INPUT} rows={2} value={settings.description} onChange={(e) => setSettings({ ...settings, description: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-[#A1A1A1]">
            <input type="checkbox" checked={settings.public_visibility} onChange={(e) => setSettings({ ...settings, public_visibility: e.target.checked })} />
            Public catalog visibility
          </label>
          <label className="flex items-center gap-2 text-[13px] text-[#A1A1A1]">
            <input type="checkbox" checked={settings.compliance_hold} onChange={(e) => setSettings({ ...settings, compliance_hold: e.target.checked })} />
            Compliance hold (blocks all acquisition)
          </label>
        </div>
        <div className="mt-4">
          <Button variant="primary" onClick={() => void saveSettings()} disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </Panel>

      <Panel
        title="Plans"
        description="A plan is what a license or grant points at. Entitlements hang off plans, so this is where upgrade tiers are defined."
      >
        <div className="flex items-end gap-3 mb-5 border border-border rounded-xl p-3 bg-background/40">
          <div className="w-40">
            <Field label="New plan slug">
              <input className={INPUT} value={newPlan.slug} onChange={(e) => setNewPlan({ ...newPlan, slug: e.target.value })} placeholder="pro" />
            </Field>
          </div>
          <div className="w-52">
            <Field label="Display name">
              <input className={INPUT} value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} placeholder="Pro" />
            </Field>
          </div>
          <Button onClick={() => void createPlan()} disabled={busy || !newPlan.slug || !newPlan.name}>
            Add plan
          </Button>
        </div>

        {plans.length === 0 && <p className="text-[13px] text-muted">No plans yet — add one above.</p>}

        {plans.map((plan) => (
          <div key={plan.id} className="border border-border rounded-xl mb-4">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">{plan.name}</span>
                <span className="font-mono text-[11px] text-muted ml-2">{plan.slug}</span>
                {product.free_plan_id === plan.id && (
                  <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded border border-accent/40 text-accent">free plan</span>
                )}
              </div>
              <span className="text-[12px] text-muted">
                {plan.active_licenses} licenses · {plan.active_grants} grants
              </span>
            </div>

            <div className="p-4">
              <p className="text-[12px] font-medium text-[#A1A1A1] mb-2">Prices</p>
              {plan.prices.length === 0 ? (
                <p className="text-[12px] text-muted mb-3">No price — free plans do not need one.</p>
              ) : (
                <ul className="text-[13px] text-[#A1A1A1] mb-3 space-y-1">
                  {plan.prices.map((price) => (
                    <li key={price.id} className="font-mono text-[12px]">
                      {(price.amount / 100).toFixed(2)} {price.currency} / {price.interval ?? 'one-time'}
                      {price.is_default && <span className="text-accent ml-2">default</span>}
                      {price.status !== 'active' && <span className="text-muted ml-2">{price.status}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-end gap-2 mb-5">
                <div className="w-28">
                  <Field label="Amount">
                    <input
                      className={INPUT}
                      type="number"
                      min={0}
                      step="0.01"
                      value={draftFor(plan.id).amount}
                      onChange={(e) => setDraft(plan.id, { amount: e.target.value })}
                      placeholder="19.00"
                    />
                  </Field>
                </div>
                <div className="w-32">
                  <Field label="Interval">
                    <select
                      className={INPUT}
                      value={draftFor(plan.id).interval}
                      onChange={(e) => setDraft(plan.id, { interval: e.target.value })}
                    >
                      <option value="month">month</option>
                      <option value="year">year</option>
                      <option value="lifetime">lifetime</option>
                      <option value="one_time">one-time</option>
                    </select>
                  </Field>
                </div>
                <Button onClick={() => void createPrice(plan.id)} disabled={busy}>
                  Add price
                </Button>
              </div>

              <p className="text-[12px] font-medium text-[#A1A1A1] mb-2">Entitlements</p>
              {features.length === 0 ? (
                <p className="text-[12px] text-muted">Define features below before assigning entitlements.</p>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 max-w-2xl">
                    {features.map((feature) => (
                      <div key={feature.id} className="contents">
                        <span className="font-mono text-[12px] text-[#A1A1A1] self-center">
                          {feature.key}
                          <span className="text-muted ml-2">({feature.type})</span>
                        </span>
                        {feature.type === 'boolean' ? (
                          <select
                            className={`${INPUT} w-32`}
                            value={grid[plan.id]?.[feature.id] ?? ''}
                            onChange={(e) =>
                              setGrid({ ...grid, [plan.id]: { ...(grid[plan.id] ?? {}), [feature.id]: e.target.value } })
                            }
                          >
                            <option value="">—</option>
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : (
                          <input
                            className={`${INPUT} w-32`}
                            value={grid[plan.id]?.[feature.id] ?? ''}
                            onChange={(e) =>
                              setGrid({ ...grid, [plan.id]: { ...(grid[plan.id] ?? {}), [feature.id]: e.target.value } })
                            }
                            placeholder="—"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted mt-2">
                    An empty cell removes the entitlement from this plan. Saving replaces the plan's whole set.
                  </p>
                  <div className="mt-3">
                    <Button onClick={() => void saveEntitlements(plan)} disabled={busy}>
                      Save entitlements for {plan.slug}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </Panel>

      <Panel
        title="Features"
        description="Entitlement keys the product's code checks. Always namespaced by product slug — the SDK reads them as <slug>.<capability>."
      >
        <div className="flex items-end gap-3 mb-4 border border-border rounded-xl p-3 bg-background/40">
          <div className="w-56">
            <Field label="Key" hint={`Prefixed with "${product.slug}." automatically.`}>
              <input className={INPUT} value={newFeature.key} onChange={(e) => setNewFeature({ ...newFeature, key: e.target.value })} placeholder="pro.enabled" />
            </Field>
          </div>
          <div className="w-52">
            <Field label="Display name">
              <input className={INPUT} value={newFeature.name} onChange={(e) => setNewFeature({ ...newFeature, name: e.target.value })} placeholder="Pro features" />
            </Field>
          </div>
          <div className="w-32">
            <Field label="Type">
              <select className={INPUT} value={newFeature.type} onChange={(e) => setNewFeature({ ...newFeature, type: e.target.value })}>
                {['boolean', 'number', 'string', 'list'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
          <Button onClick={() => void createFeature()} disabled={busy || !newFeature.key || !newFeature.name}>
            Add feature
          </Button>
        </div>

        <ul className="space-y-1">
          {features.map((feature) => (
            <li key={feature.id} className="flex items-center justify-between text-[13px] py-1">
              <span className="font-mono text-[12px] text-[#A1A1A1]">
                {feature.key} <span className="text-muted">({feature.type})</span> — {feature.name}
              </span>
              <button
                onClick={() =>
                  void run(
                    () => adminCall(`/catalog/features/${feature.id}`, { method: 'DELETE' }).then(() => undefined),
                    `Removed ${feature.key}.`
                  )
                }
                disabled={busy}
                className="text-[12px] px-2 py-1 rounded-md text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
          {features.length === 0 && <li className="text-[13px] text-muted">No features defined yet.</li>}
        </ul>
      </Panel>

      <Status error={error} message={message} />
    </>
  );
}
