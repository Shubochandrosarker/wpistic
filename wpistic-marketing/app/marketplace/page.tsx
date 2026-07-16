import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductCard } from "@/components/ui/ProductCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { products, productCategories } from "@/lib/products";

export const metadata: Metadata = {
  title: "Marketplace",
  description:
    "Browse the WPistic marketplace by category — live products, beta releases, and what's coming next.",
};

const live = products.filter((p) => p.status === "Live");
const beta = products.filter((p) => p.status === "Beta");
const comingSoon = products.filter((p) => p.status === "Coming Soon");

export default function MarketplacePage() {
  return (
    <>
      <Section className="pt-16 pb-8 sm:pt-24">
        <Container>
          <SectionHeading
            eyebrow="Marketplace"
            title="Browse the WPistic marketplace"
            description="Every product WPistic ships, organized by how ready it is to run in production — plus what's coming next."
          />
        </Container>
      </Section>

      <Section className="pt-4">
        <Container>
          <div className="flex items-center gap-3">
            <Badge tone="green" dot>
              Live
            </Badge>
            <h2 className="font-display text-xl font-bold text-ink-900">
              Ready for production ({live.length})
            </h2>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50 pt-16">
        <Container>
          <div className="flex items-center gap-3">
            <Badge tone="purple" dot>
              Beta
            </Badge>
            <h2 className="font-display text-xl font-bold text-ink-900">
              Early access ({beta.length})
            </h2>
          </div>
          <p className="mt-2 max-w-2xl text-[14.5px] text-ink-600">
            Beta products are stable enough for real use, with active development and direct
            access to the team building them.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {beta.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="flex items-center gap-3">
            <Badge tone="gray" dot>
              Coming soon
            </Badge>
            <h2 className="font-display text-xl font-bold text-ink-900">
              In development ({comingSoon.length})
            </h2>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {comingSoon.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50">
        <Container>
          <SectionHeading eyebrow="Categories" title="Or browse by category" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {productCategories.map((cat) => {
              const count = products.filter((p) => p.category === cat).length;
              return (
                <a
                  key={cat}
                  href={`/products?category=${encodeURIComponent(cat)}`}
                  className="rounded-2xl border border-ink-150 bg-white p-5 transition-shadow hover:shadow-[var(--shadow-md)]"
                >
                  <div className="font-semibold text-ink-900">{cat}</div>
                  <div className="mt-1 text-sm text-ink-500">{count} products</div>
                </a>
              );
            })}
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink-900">
            Want more than one? Bundles cost less.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-ink-600">
            Every WPistic plan bundles multiple products for less than buying them separately.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button href="/bundles" variant="green" size="lg" icon="arrow">
              See bundles
            </Button>
            <Button href="/pricing" variant="outline" size="lg">
              View pricing
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
