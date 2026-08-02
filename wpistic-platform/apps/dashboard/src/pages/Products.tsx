import { Package } from 'lucide-react';
import { useCatalog, useClaimFreeProduct, useOrgProducts } from '../hooks/useApi';
import { Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';
import { ProductCard, type OwnedProduct } from '../components/ProductCard';

export function Products() {
  const owned = useOrgProducts();
  const catalog = useCatalog();
  const claim = useClaimFreeProduct();

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
                    onClick={() => claim.mutate(p.slug)}
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
    </div>
  );
}
