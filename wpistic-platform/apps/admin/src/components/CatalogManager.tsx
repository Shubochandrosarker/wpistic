/**
 * Product catalog list + creation. Editing a single product (its plans,
 * prices, features, and entitlements) lives on the product detail page in
 * ProductEditor.
 */
import { useState } from 'react';
import { adminCall, describeError } from '../lib/client';
import { Button, Field, INPUT, Panel, Status, useReloadAfter } from './admin-ui';

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  type: string;
  catalog_state: string;
  acquisition_mode: string;
  public_visibility: boolean;
  compliance_hold: boolean;
  plan_count: number;
  feature_count: number;
  active_licenses: number;
  active_grants: number;
}

const STATE_STYLE: Record<string, string> = {
  live: 'bg-green-500/10 text-green-300 border-green-500/30',
  beta: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  coming_soon: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  draft: 'bg-surface-hover text-[#A1A1A1] border-border',
  retired: 'bg-red-500/10 text-red-300 border-red-500/30',
};

export default function CatalogManager({ products }: { products: CatalogProduct[] }) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useReloadAfter(message);

  const [form, setForm] = useState({
    slug: '',
    name: '',
    description: '',
    type: 'plugin',
    catalog_state: 'draft',
    acquisition_mode: 'free_claim',
    public_visibility: false,
    marketing_url: '',
    app_url: '',
    scaffold_free_plan: true,
    free_sites_max: 1,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminCall('/catalog/products', {
        body: {
          slug: form.slug.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          type: form.type,
          catalog_state: form.catalog_state,
          acquisition_mode: form.acquisition_mode,
          public_visibility: form.public_visibility,
          // Empty strings are not URLs; send nothing rather than fail validation.
          marketing_url: form.marketing_url.trim() || null,
          app_url: form.app_url.trim() || null,
          scaffold_free_plan: form.acquisition_mode === 'free_claim' ? true : form.scaffold_free_plan,
          free_sites_max: Number(form.free_sites_max) || 1,
        },
      });
      setMessage(`Created ${form.slug}. Reloading…`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const retire = async (product: CatalogProduct) => {
    setBusy(true);
    setError(null);
    try {
      await adminCall(`/catalog/products/${product.id}/retire`, {
        mfa: true,
        reason: `Retire "${product.name}"? It disappears from the public catalog and stops accepting new claims. Existing customers keep working.`,
      });
      setMessage(`Retired ${product.slug}. Reloading…`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (product: CatalogProduct) => {
    setBusy(true);
    setError(null);
    try {
      await adminCall(`/catalog/products/${product.id}`, {
        method: 'DELETE',
        mfa: true,
        reason: `Permanently delete "${product.name}"? Only possible while no customer holds it.`,
      });
      setMessage(`Deleted ${product.slug}. Reloading…`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel
        title="Products"
        description={`${products.length} in the catalog. Click a product to edit its plans, prices, features, and entitlements.`}
        actions={
          <Button variant="primary" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : 'New product'}
          </Button>
        }
      >
        {creating && (
          <div className="border border-border rounded-xl p-4 mb-5 bg-background/40">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Slug" hint="Lowercase, hyphenated. Becomes the license key prefix and entitlement namespace — it cannot be changed casually later.">
                <input className={INPUT} value={form.slug} onChange={(e) => set('slug', e.target.value)} placeholder="seoistic" />
              </Field>
              <Field label="Name">
                <input className={INPUT} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="SEOistic" />
              </Field>
              <Field label="Type" hint="Plugin products get a license key on claim; SaaS products are reached by SSO.">
                <select className={INPUT} value={form.type} onChange={(e) => set('type', e.target.value)}>
                  <option value="plugin">plugin</option>
                  <option value="saas">saas</option>
                  <option value="addon">addon</option>
                  <option value="bundle">bundle</option>
                </select>
              </Field>
              <Field label="Acquisition mode">
                <select className={INPUT} value={form.acquisition_mode} onChange={(e) => set('acquisition_mode', e.target.value)}>
                  <option value="free_claim">free_claim</option>
                  <option value="paid">paid</option>
                  <option value="invite_only">invite_only</option>
                  <option value="compliance_hold">compliance_hold</option>
                </select>
              </Field>
              <Field label="Catalog state">
                <select className={INPUT} value={form.catalog_state} onChange={(e) => set('catalog_state', e.target.value)}>
                  <option value="draft">draft</option>
                  <option value="coming_soon">coming_soon</option>
                  <option value="beta">beta</option>
                  <option value="live">live</option>
                </select>
              </Field>
              <Field label="Free sites per license" hint="Seeds the free plan's <slug>.sites.max entitlement, which becomes the default activation limit.">
                <input
                  className={INPUT}
                  type="number"
                  min={1}
                  value={form.free_sites_max}
                  onChange={(e) => set('free_sites_max', Number(e.target.value))}
                />
              </Field>
              <Field label="Marketing URL">
                <input className={INPUT} value={form.marketing_url} onChange={(e) => set('marketing_url', e.target.value)} placeholder="https://seoistic.wpistic.com" />
              </Field>
              <Field label="App URL" hint="SaaS products only.">
                <input className={INPUT} value={form.app_url} onChange={(e) => set('app_url', e.target.value)} placeholder="https://app.seoistic.com" />
              </Field>
              <div className="col-span-2">
                <Field label="Description">
                  <textarea className={INPUT} rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-[13px] text-[#A1A1A1] col-span-2">
                <input type="checkbox" checked={form.public_visibility} onChange={(e) => set('public_visibility', e.target.checked)} />
                Visible in the public catalog
              </label>
            </div>
            <p className="text-[11px] text-muted mt-3">
              A free_claim product is created with a <code className="font-mono">free</code> plan, a{' '}
              <code className="font-mono">{form.slug || 'slug'}.sites.max</code> feature, and the entitlement joining
              them, so it is claimable immediately.
            </p>
            <div className="mt-3">
              <Button variant="primary" onClick={() => void create()} disabled={busy || !form.slug || !form.name}>
                {busy ? 'Creating…' : 'Create product'}
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[13px] text-muted">
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Acquisition</th>
                <th className="px-3 py-2 font-medium">Plans</th>
                <th className="px-3 py-2 font-medium">In use</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {products.map((p) => {
                const inUse = p.active_licenses + p.active_grants;
                return (
                  <tr key={p.id} className="hover:bg-surface-hover/50 transition-colors">
                    <td className="px-3 py-2.5">
                      <a href={`/catalog/${p.id}`} className="text-white hover:text-accent">
                        {p.name}
                      </a>
                      <span className="font-mono text-[11px] text-muted block">{p.slug}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-[#A1A1A1]">{p.type}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-[12px] ${STATE_STYLE[p.catalog_state] ?? STATE_STYLE.draft}`}>
                        {p.catalog_state.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-[#A1A1A1]">
                      {p.acquisition_mode.replace(/_/g, ' ')}
                      {p.compliance_hold && <span className="text-red-300 ml-1">• hold</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-[#A1A1A1]">
                      {p.plan_count} / {p.feature_count} features
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-[#A1A1A1]">
                      {inUse === 0 ? <span className="text-muted">—</span> : `${p.active_licenses} lic · ${p.active_grants} grants`}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <a href={`/catalog/${p.id}`} className="text-[12px] px-2 py-1 rounded-md text-[#A1A1A1] hover:text-white hover:bg-surface-hover">
                        Edit
                      </a>
                      {p.catalog_state !== 'retired' && (
                        <button
                          onClick={() => void retire(p)}
                          disabled={busy}
                          className="text-[12px] px-2 py-1 rounded-md text-[#A1A1A1] hover:text-white hover:bg-surface-hover disabled:opacity-50"
                        >
                          Retire
                        </button>
                      )}
                      {inUse === 0 && (
                        <button
                          onClick={() => void remove(p)}
                          disabled={busy}
                          className="text-[12px] px-2 py-1 rounded-md text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Status error={error} message={message} />
      </Panel>
    </>
  );
}
