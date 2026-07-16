import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Section } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Card } from "@/components/ui/Card";
import { ProductGlyph } from "@/components/ui/ProductGlyph";
import { ProductCard } from "@/components/ui/ProductCard";
import { getProduct, products } from "@/lib/products";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.description,
    openGraph: { title: `${product.name} — ${site.name}`, description: product.description },
  };
}

const STATUS_TONE = { Live: "green", Beta: "purple", "Coming Soon": "gray" } as const;

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const related = products.filter((p) => p.id !== product.id && p.category === product.category).slice(0, 3);

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: product.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "WordPress",
    description: product.description,
    ...(product.startingPrice != null
      ? { offers: { "@type": "Offer", price: product.startingPrice, priceCurrency: "USD" } }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />

      <Section className="pt-16 pb-12 sm:pt-20">
        <Container>
          <nav className="text-sm text-ink-400">
            <Link href="/products" className="hover:text-purple-600">
              Products
            </Link>
            <span className="mx-2">/</span>
            <span className="text-ink-600">{product.name}</span>
          </nav>

          <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_360px]">
            <div>
              <div className="flex items-center gap-4">
                <ProductGlyph category={product.category} icon={product.icon} size={56} />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
                      {product.name}
                    </h1>
                    {product.flagship && <Badge tone="purple">Flagship</Badge>}
                    <Badge tone={STATUS_TONE[product.status]} dot>
                      {product.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-ink-500">{product.tagline}</p>
                </div>
              </div>

              <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ink-700">
                {product.description}
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {product.features.map((f) => (
                  <div key={f} className="flex items-start gap-3 rounded-2xl border border-ink-150 bg-white p-4">
                    <Icon name="check" size={16} className="mt-0.5 shrink-0 text-green-600" />
                    <span className="text-[14.5px] text-ink-700">{f}</span>
                  </div>
                ))}
              </div>

              {product.integrations.length > 0 && (
                <div className="mt-10">
                  <div className="text-xs font-bold tracking-wider text-ink-400 uppercase">
                    Works with
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {product.integrations.map((name) => (
                      <span
                        key={name}
                        className="rounded-full bg-ink-100 px-3.5 py-1.5 text-[13px] font-semibold text-ink-700"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <Card className="sticky top-24">
                {product.startingPrice != null ? (
                  <>
                    <div className="text-xs font-bold tracking-wider text-ink-400 uppercase">
                      Starting at
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="font-display text-4xl font-extrabold text-ink-900">
                        ${product.startingPrice}
                      </span>
                      <span className="text-sm text-ink-500">/mo</span>
                    </div>
                    <p className="mt-2 text-[13px] text-ink-500">
                      Or bundled free in the Professional plan and above.
                    </p>
                    <Button href="/pricing" variant="green" className="mt-6 w-full" icon="arrow">
                      Start free trial
                    </Button>
                    <Button href="/contact" variant="outline" className="mt-3 w-full">
                      Talk to sales
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-xs font-bold tracking-wider text-ink-400 uppercase">
                      Coming soon
                    </div>
                    <p className="mt-3 text-[14.5px] leading-relaxed text-ink-600">
                      {product.name} is in development. Join the waitlist to hear when it's ready
                      for early access.
                    </p>
                    <Button href="/contact" variant="green" className="mt-6 w-full">
                      Join the waitlist
                    </Button>
                  </>
                )}
              </Card>
            </div>
          </div>
        </Container>
      </Section>

      {related.length > 0 && (
        <Section className="bg-ink-50">
          <Container>
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink-900">
              More {product.category}
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </Container>
        </Section>
      )}
    </>
  );
}
