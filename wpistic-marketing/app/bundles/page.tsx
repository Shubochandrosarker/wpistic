import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PricingCard } from "@/components/ui/PricingCard";
import { getProduct } from "@/lib/products";
import { pricingTiers } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Bundles",
  description:
    "Every paid WPistic plan already bundles multiple products for less than buying them individually — no separate bundle-purchasing flow required.",
};

const bundleExampleIds = ["chatbotistic", "crmistic", "memberistic"];
const bundleExampleProducts = bundleExampleIds
  .map((id) => getProduct(id))
  .filter((p): p is NonNullable<typeof p> => Boolean(p));
const bundleExampleTotal = bundleExampleProducts.reduce(
  (sum, p) => sum + (p.startingPrice ?? 0),
  0
);
const professionalTier = pricingTiers.find((t) => t.id === "professional")!;

const displayTiers = pricingTiers.filter((t) => t.id !== "lifetime" && t.id !== "enterprise");

export default function BundlesPage() {
  return (
    <>
      <Section className="pt-16 pb-12 sm:pt-24">
        <Container className="max-w-3xl text-center">
          <SectionHeading
            eyebrow="Bundles"
            title="Every plan is already a bundle"
            description="WPistic doesn't sell bundles as a separate purchase flow — every paid pricing tier already bundles multiple products together for less than buying them one at a time."
            align="center"
          />
        </Container>
      </Section>

      <Section className="pt-0 pb-16">
        <Container>
          <Card dark className="grid gap-8 overflow-hidden p-10 sm:p-14 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge tone="green" dot>
                The math
              </Badge>
              <h2 className="font-display mt-4 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Buy the products separately, or bundle them into one plan
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
                {bundleExampleProducts.map((p) => p.name).join(" + ")} bought separately costs $
                {bundleExampleTotal}/mo standalone. The {professionalTier.name} plan includes all
                fifteen products — including those three — from ${professionalTier.annualPrice}/mo
                billed annually.
              </p>
            </div>
            <div className="grid gap-3">
              {bundleExampleProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/5 px-5 py-3.5"
                >
                  <span className="text-sm font-semibold text-white">{p.name}</span>
                  <span className="text-sm text-ink-300">${p.startingPrice}/mo</span>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/10 px-5 py-3.5">
                <span className="text-sm font-bold text-white">Standalone total</span>
                <span className="text-sm font-bold text-white">${bundleExampleTotal}/mo</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-green-400/40 bg-green-500/10 px-5 py-3.5">
                <span className="text-sm font-bold text-white">
                  {professionalTier.name} plan (all 15 products, billed annually)
                </span>
                <span className="text-sm font-bold text-green-400">
                  ${professionalTier.annualPrice}/mo
                </span>
              </div>
            </div>
          </Card>
        </Container>
      </Section>

      <Section className="bg-ink-50">
        <Container>
          <SectionHeading
            eyebrow="Pick a plan"
            title="Every tier bundles more than it costs alone"
            description="Starter, Professional, Business, and Agency each include multiple products under one subscription — the more products you'd otherwise run, the more a bundle saves."
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {displayTiers.map((tier) => (
              <PricingCard key={tier.id} tier={tier} annual={true} />
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
            Need a bundle we don&apos;t list?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-ink-600">
            See full plan details and monthly pricing, or talk to us about a custom bundle for
            your agency or organization.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button href="/pricing" variant="green" size="lg" icon="arrow">
              See full pricing
            </Button>
            <Button href="/contact" variant="outline" size="lg">
              Talk about custom bundles
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
