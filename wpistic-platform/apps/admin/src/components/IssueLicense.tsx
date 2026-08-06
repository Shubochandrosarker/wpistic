/**
 * Issue a license key to an organization by hand — for a customer migrating
 * in, a support replacement, or a plan sold outside the self-serve flow.
 *
 * The raw key is returned once and never again; only its SHA-256 is stored.
 * That is why the result is held on screen behind an explicit dismissal
 * instead of the usual auto-reload.
 */
import { useState } from 'react';
import { adminCall, describeError } from '../lib/client';
import { Button, Field, INPUT, Panel, SecretReveal, Status } from './admin-ui';

export interface CatalogOption {
  slug: string;
  name: string;
  type: string;
  plans: string[];
}

export default function IssueLicense({
  organizationId,
  organizationName,
  catalog,
}: {
  organizationId: string;
  organizationName: string;
  catalog: CatalogOption[];
}) {
  // Only plugin products have anything to do with a license key.
  const licensable = catalog.filter((p) => p.type === 'plugin');
  const [productSlug, setProductSlug] = useState(licensable[0]?.slug ?? '');
  const [planSlug, setPlanSlug] = useState('');
  const [seats, setSeats] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ key: string; mask: string } | null>(null);

  const plans = licensable.find((p) => p.slug === productSlug)?.plans ?? [];

  const issue = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await adminCall<{ license_key: string; key_mask: string }>('/licensing', {
        reason: `Issue a ${productSlug} (${planSlug}) license to ${organizationName}`,
        body: {
          organization_id: organizationId,
          product_slug: productSlug,
          plan_slug: planSlug,
          // Omitted means "take the plan's <slug>.sites.max entitlement".
          ...(seats ? { max_activations: Number(seats) } : {}),
        },
      });
      setIssued({ key: result.license_key, mask: result.key_mask });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  if (licensable.length === 0) {
    return (
      <Panel title="Issue a license">
        <p className="text-[13px] text-muted">No plugin products in the catalog yet.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Issue a license" description="Mints a key for a plugin product and shows it once.">
      {issued && (
        <SecretReveal
          label={`License key (${issued.mask})`}
          value={issued.key}
          onDismiss={() => {
            setIssued(null);
            window.location.reload();
          }}
        />
      )}
      <div className="flex items-end gap-3">
        <div className="w-52">
          <Field label="Product">
            <select
              className={INPUT}
              value={productSlug}
              onChange={(e) => {
                setProductSlug(e.target.value);
                setPlanSlug('');
              }}
            >
              {licensable.map((p) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="w-40">
          <Field label="Plan">
            <select className={INPUT} value={planSlug} onChange={(e) => setPlanSlug(e.target.value)}>
              <option value="">— select —</option>
              {plans.map((slug) => (
                <option key={slug} value={slug}>{slug}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="w-32">
          <Field label="Seats" hint="Blank = plan default">
            <input className={INPUT} type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} />
          </Field>
        </div>
        <div className="pb-1">
          <Button variant="primary" onClick={() => void issue()} disabled={busy || !planSlug}>
            {busy ? 'Issuing…' : 'Issue license'}
          </Button>
        </div>
      </div>
      <Status error={error} />
    </Panel>
  );
}
