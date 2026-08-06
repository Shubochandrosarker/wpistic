import { useState } from 'react';
import { Package } from 'lucide-react';
import { useCatalog, useClaimFreeProduct, useOrgProducts } from '../hooks/useApi';
import { Button, Card, EmptyState, Modal, PageHeader, Skeleton } from '../components/ui';
import { ProductCard, type OwnedProduct } from '../components/ProductCard';

export function Products() {
  const owned = useOrgProducts();
  const catalog = useCatalog();
  const claim = useClaimFreeProduct();

  // A claimed plugin's license key comes back exactly once — only its hash is
  // stored server-side. Hold it in a modal the customer has to dismiss rather
  // than letting a re-render drop it on the floor.
  const [issuedKey, setIssuedKey] = useState<{ product: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const claimProduct = (slug: string, name: string) => {
    claim.mutate(slug, {
      onSuccess: (result) => {
        if (result.license) {
          setCopied(false);
          setIssuedKey({ product: name, key: result.license.license_key });
        }
      },
    });
  };

  const ownedSlugs = new Set((owned.data?.products ?? []).map((p) => p.slug));
  const discover = (catalog.data?.products ?? []).filter((p) => !ownedSlugs.has(p.slug));

  return (
    <div>
      <PageHeader title="Products" description="Products your organization owns, and the rest of the ecosystem." />

      {owned.isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : (owned.data?.products ?? []).length === 0 ? (
        <Card className="mb-10">
          <EmptyState
            icon={<Package size={32} />}
            title="No products yet"
            description="When you purchase a WPistic product or activate a license, it shows up here with its plan and status."
            action={
              <a href="https://www.wpistic.com" target="_blank" rel="noreferrer">
                <Button>Browse the marketplace</Button>
              </a>
            }
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {(owned.data?.products ?? []).map((p) => (
            <ProductCard key={p.id} product={p as unknown as OwnedProduct} />
          ))}
        </div>
      )}

      {discover.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Discover</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {discover.map((p) => (
              <Card key={p.id} className="p-5" hover>
                <div className="flex items-center gap-3 mb-2.5">
                  <span className="w-9 h-9 rounded-lg bg-surface-hover border border-border grid place-items-center font-bold text-muted">
                    {p.name.charAt(0)}
                  </span>
                  <h3 className="font-semibold">{p.name}</h3>
                </div>
                <p className="text-[13px] text-muted line-clamp-2 mb-4">{p.description}</p>
                {p.compliance_hold || p.acquisition_mode === 'compliance_hold' ? (
                  <Button size="sm" variant="secondary" className="w-full" disabled>
                    Coming soon
                  </Button>
                ) : p.acquisition_mode === 'free_claim' ? (
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={claim.isPending}
                    onClick={() => claimProduct(p.slug, p.name)}
                  >
                    {claim.isPending ? 'Claiming…' : 'Claim free access'}
                  </Button>
                ) : (
                  <a href={p.marketing_url ?? 'https://www.wpistic.com'} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="secondary" className="w-full">
                      Learn more
                    </Button>
                  </a>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      <Modal
        open={issuedKey !== null}
        onClose={() => setIssuedKey(null)}
        title={`Your ${issuedKey?.product ?? ''} license key`}
        footer={
          <Button variant="secondary" onClick={() => setIssuedKey(null)} disabled={!copied}>
            I've saved it
          </Button>
        }
      >
        <p className="text-[13px] text-muted mb-3">
          Paste this into the plugin's settings screen to activate it. This is the only time it is shown — we store
          only a hash of it, so it cannot be recovered later. If you lose it, rotate the key from the Licenses page.
        </p>
        <code className="block font-mono text-[13px] bg-surface-hover border border-border rounded-lg px-3 py-2 break-all mb-3">
          {issuedKey?.key}
        </code>
        <Button
          size="sm"
          onClick={() => {
            if (issuedKey) void navigator.clipboard.writeText(issuedKey.key).then(() => setCopied(true));
          }}
        >
          {copied ? 'Copied' : 'Copy key'}
        </Button>
      </Modal>
    </div>
  );
}
