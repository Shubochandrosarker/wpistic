import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProductGlyph } from "@/components/ui/ProductGlyph";
import { products } from "@/lib/products";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Roadmap",
  description:
    "Where every WPistic product stands today, and what's in development next — grouped by status, not fake ship dates.",
};

const nextNotes: Record<string, string> = {
  chatbotistic:
    "Deeper Insightistic reporting on conversation outcomes, and more languages detected out of the box.",
  memberistic:
    "More flexible dunning rules and additional gating options beyond content and downloads.",
  bookingistic:
    "Group bookings and multi-resource scheduling for businesses that book more than one resource per appointment.",
  insightistic: "More granular per-product usage breakdowns and configurable digest schedules.",
  wpagentistic:
    "More agents shipping monthly, plus the ability to chain agents together for multi-step workflows.",
  postistic: "Direct scheduling integrations with more social platforms and longer-form content briefs.",
  crmistic: "Deeper pipeline automation rules and more segment-based messaging options.",
  licenseistic:
    "Expanding the public REST API surface based on early feedback from customers migrating off custom license servers.",
  fflistic: "Broader state-by-state compliance checklist coverage as beta feedback comes in.",
  travelistic:
    "In development — early access planned once the itinerary builder and departure calendar are ready for real bookings.",
  verifyistic:
    "In development — early access planned once document review workflows are ready for regulated use cases.",
};

const live = products.filter((p) => p.status === "Live");
const beta = products.filter((p) => p.status === "Beta");
const comingSoon = products.filter((p) => p.status === "Coming Soon");

function RoadmapRow({ product }: { product: (typeof products)[number] }) {
  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <ProductGlyph category={product.category} icon={product.icon} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15.5px] font-bold text-ink-900">{product.name}</span>
          {product.flagship && <Badge tone="purple">Flagship</Badge>}
        </div>
        <p className="mt-1 text-[13.5px] text-ink-500">{product.tagline}</p>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-600">
          <span className="font-semibold text-ink-700">What's next: </span>
          {nextNotes[product.id] ?? "In active development, with details to follow."}
        </p>
      </div>
    </Card>
  );
}

export default function RoadmapPage() {
  return (
    <>
      <Section className="pt-16 pb-8 sm:pt-24">
        <Container>
          <SectionHeading
            eyebrow="Roadmap"
            title="Where every product stands, and what's next"
            description="Grouped by how ready each product is today. We keep timing honest — no invented ship dates, just what's actually in development."
          />
        </Container>
      </Section>

      <Section className="pt-4">
        <Container>
          <div className="flex items-center gap-3">
            <Badge tone="green" dot>
              Live now
            </Badge>
            <h2 className="font-display text-xl font-bold text-ink-900">
              In production ({live.length})
            </h2>
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {live.map((p) => (
              <RoadmapRow key={p.id} product={p} />
            ))}
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50 pt-16">
        <Container>
          <div className="flex items-center gap-3">
            <Badge tone="purple" dot>
              In beta
            </Badge>
            <h2 className="font-display text-xl font-bold text-ink-900">
              Early access ({beta.length})
            </h2>
          </div>
          <p className="mt-2 max-w-2xl text-[14.5px] text-ink-600">
            Stable enough for real use, with active development and direct access to the team
            building them.
          </p>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {beta.map((p) => (
              <RoadmapRow key={p.id} product={p} />
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
          <p className="mt-2 max-w-2xl text-[14.5px] text-ink-600">
            Early access soon — join the waitlist from each product page to be notified when it
            opens up.
          </p>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {comingSoon.map((p) => (
              <RoadmapRow key={p.id} product={p} />
            ))}
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50">
        <Container className="text-center">
          <h2 className="font-display mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-4xl">
            Missing something you need?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-600">
            This roadmap reflects real development priorities, not a fixed schedule. If there's a
            feature or product you're waiting on, tell us — it genuinely shapes what we build next.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/contact" variant="green" size="lg" icon="arrow">
              Share feedback
            </Button>
            <Button href={`mailto:${site.supportEmail}`} variant="outline" size="lg">
              Email the team
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
