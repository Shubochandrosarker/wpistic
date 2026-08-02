import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { FaqAccordion } from "@/components/ui/FaqAccordion";
import { Button } from "@/components/ui/Button";
import { products } from "@/lib/products";
import { pricingTiers, pricingFaqs } from "@/lib/pricing";
import { PricingToggle } from "./PricingToggle";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "WPistic free launch: claim a product without a card. Paid plans and checkout are coming soon.",
};

export default function PricingPage() {
  return (
    <>
      <Section className="pt-16 pb-12 sm:pt-24">
        <Container className="max-w-3xl text-center">
          <SectionHeading
            eyebrow="Pricing"
            title="One price for the whole ecosystem"
            description="Claim free product access with one login and one dashboard. Paid plans are displayed for planning only and checkout remains disabled during the free launch."
            align="center"
          />
        </Container>
      </Section>

      <Section className="pt-0">
        <Container>
          <PricingToggle tiers={pricingTiers} />
        </Container>
      </Section>

      <Section className="bg-ink-50" id="lifetime">
        <Container className="max-w-3xl text-center">
          <SectionHeading
            eyebrow="Or price by product"
            title="Only need one or two products?"
            description="Every product also has its own standalone monthly price — no bundle required."
            align="center"
          />
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {products
              .filter((p) => p.startingPrice != null)
              .map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-2xl border border-ink-150 bg-white px-5 py-3.5"
                >
                  <span className="text-sm font-semibold text-ink-900">{p.name}</span>
                  <span className="text-sm text-ink-500">from ${p.startingPrice}/mo</span>
                </div>
              ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-3xl">
          <SectionHeading eyebrow="Questions" title="Pricing FAQ" align="center" />
          <div className="mt-10">
            <FaqAccordion items={pricingFaqs} />
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50">
        <Container className="text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
            Still deciding? Talk to us.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-ink-600">
            We'll help you figure out which products and plan actually fit how you work.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button href="/contact" variant="green" size="lg" icon="arrow">
              Talk to sales
            </Button>
            <Button href="/products" variant="outline" size="lg">
              Compare products
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
