import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { TestimonialCard } from "@/components/ui/TestimonialCard";
import { products } from "@/lib/products";
import { testimonials } from "@/lib/testimonials";

export const metadata: Metadata = {
  title: "About",
  description:
    "WPistic builds a WordPress-native suite of SaaS products — chat, CRM, bookings, memberships, analytics, and licensing — that share one dashboard, one login, and one bill.",
};

const values = [
  {
    icon: "cube",
    title: "Built on WordPress, not around it",
    body: "Every product installs like a plugin and runs on the site you already own. No headless rebuild, no separate app to stand up.",
  },
  {
    icon: "key",
    title: "One login, one bill",
    body: "Entitlements, billing, and usage live in a single account across every product — not a fresh signup and a fresh invoice for each one.",
  },
  {
    icon: "card",
    title: "No dark patterns in billing",
    body: "Clear plans, a real free tier, and cancellation that actually cancels. Pricing you can explain to a client without a footnote.",
  },
  {
    icon: "handshake",
    title: "Support from people who ship the product",
    body: "The team answering support email is the team writing the code — no tiered ticket queue standing between you and an answer.",
  },
];

const featured = testimonials.slice(0, 2);

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <Section className="pt-16 pb-12 sm:pt-24">
        <Container>
          <Eyebrow>About</Eyebrow>
          <h1 className="font-display mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-5xl">
            We're building the WordPress SaaS ecosystem we wished existed.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-600">
            Most WordPress businesses run on a stack of disconnected tools — a chat widget from one
            vendor, a CRM from another, a booking plugin from a third — each with its own login,
            its own bill, and no idea the others exist. WPistic is a single suite of products built
            to work together from the start: chat, CRM, bookings, memberships, analytics, and
            licensing, sharing one dashboard, one login, and one bill.
          </p>
        </Container>
      </Section>

      {/* Story */}
      <Section className="bg-ink-50 pt-0">
        <Container>
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionHeading eyebrow="Our story" title="Started by a WordPress product studio" />
              <p className="mt-6 text-[15px] leading-relaxed text-ink-600">
                WPistic started as an internal problem. Building and supporting WordPress sites for
                clients meant stitching together a different chat tool, CRM, and booking plugin for
                every project — each with its own settings screen, its own outage, its own support
                email. There was no version of "the WordPress SaaS stack" that behaved like one
                product.
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-600">
                So we built one. Each WPistic product ships as a standalone plugin that's useful on
                its own, but they're designed from day one to share data and entitlements through
                the same dashboard — a chat conversation becomes a CRM contact, a booking updates
                analytics, a membership change updates a license, without a Zapier account in the
                middle.
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-600">
                We're still early — not every product is at version one, and we say so plainly on
                the marketplace page. What's consistent is the ecosystem approach: build fewer,
                better-connected products instead of a pile of separate SaaS logins.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-6 rounded-[2rem] border border-ink-150 bg-white p-8 sm:p-10">
              <Stat value={String(products.length)} label="Products in the suite" />
              <Stat value="1" label="Dashboard login" />
              <Stat value="13mo" label="Analytics retention, no sampling" />
              <Stat value="Free" label="Card-free launch access" />
            </div>
          </div>
        </Container>
      </Section>

      {/* Values */}
      <Section>
        <Container>
          <SectionHeading
            eyebrow="What we believe"
            title="Principles that shape every product decision"
            align="center"
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v) => (
              <Card key={v.title}>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-purple-100 text-purple-600">
                  <Icon name={v.icon} size={20} />
                </div>
                <h3 className="font-display mt-4 text-base font-bold text-ink-900">{v.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-600">{v.body}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* Social proof */}
      <Section className="bg-ink-50">
        <Container>
          <SectionHeading
            eyebrow="Who we build for"
            title="Agencies, freelancers, and product teams running real WordPress businesses"
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {featured.map((t) => (
              <TestimonialCard key={t.name} testimonial={t} />
            ))}
          </div>
        </Container>
      </Section>

      {/* Closing CTA */}
      <Section>
        <Container className="text-center">
          <h2 className="font-display mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-4xl">
            See the products, or talk to us directly
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-600">
            Start free with one product, or reach out if you want to talk through what an agency or
            multi-site rollout would look like.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/pricing" variant="green" size="lg" icon="arrow">
              View pricing
            </Button>
            <Button href="/contact" variant="outline" size="lg">
              Contact us
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
