import Link from "next/link";
import { Container, Section } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Stat } from "@/components/ui/Stat";
import { ProductCard } from "@/components/ui/ProductCard";
import { TestimonialCard } from "@/components/ui/TestimonialCard";
import { FaqAccordion } from "@/components/ui/FaqAccordion";
import { Card } from "@/components/ui/Card";
import { products } from "@/lib/products";
import { testimonials } from "@/lib/testimonials";
import { pricingFaqs } from "@/lib/pricing";

const featured = products.filter((p) => p.flagship || p.status === "Live").slice(0, 6);

const howItWorks = [
  {
    title: "Install the products you need",
    body: "Start with one product or the whole suite — Chatbotistic, CRMistic, Bookingistic, and the rest install like any WordPress plugin.",
    icon: "cube",
  },
  {
    title: "They already talk to each other",
    body: "A chat conversation becomes a CRM contact. A booking updates analytics. No Zapier, no webhooks to configure yourself.",
    icon: "layers",
  },
  {
    title: "Manage everything from one dashboard",
    body: "Licenses, billing, usage, and every connected site live in a single WPistic account — not a separate login per product.",
    icon: "chart",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <Section className="pt-16 pb-20 sm:pt-24 sm:pb-28">
        <Container>
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <div>
              <Eyebrow>The WordPress SaaS ecosystem</Eyebrow>
              <h1 className="font-display mt-4 text-4xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-5xl lg:text-6xl">
                One dashboard for every WordPress product your business runs on.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">
                Chat, CRM, bookings, memberships, analytics, and licensing — eleven WPistic
                products that share one login, one bill, and one set of customer data. Not
                WooCommerce. Not a dozen disconnected plugins.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button href="/pricing" variant="green" size="lg" icon="arrow">
                  Start free
                </Button>
                <Button href="/products" variant="outline" size="lg" icon="play" iconPosition="left">
                  See the products
                </Button>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-ink-500">
                <span className="flex items-center gap-2">
                  <Icon name="check" size={16} className="text-green-600" /> No WooCommerce required
                </span>
                <span className="flex items-center gap-2">
                  <Icon name="check" size={16} className="text-green-600" /> Cancel anytime
                </span>
                <span className="flex items-center gap-2">
                  <Icon name="check" size={16} className="text-green-600" /> 14-day free trial
                </span>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-purple-100 via-white to-green-50" />
              <Card className="overflow-hidden p-0">
                <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-3.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  <span className="ml-3 text-xs font-medium text-ink-400">app.wpistic.com/dashboard</span>
                </div>
                <div className="grid grid-cols-2 gap-3 p-5">
                  {[
                    { label: "Active licenses", value: "8", icon: "key", bg: "bg-purple-100", fg: "text-purple-600" },
                    { label: "Connected sites", value: "3", icon: "globe", bg: "bg-green-100", fg: "text-green-700" },
                    { label: "Chat conversations", value: "1,204", icon: "chat", bg: "bg-blue-100", fg: "text-blue-700" },
                    { label: "This month's plan", value: "Pro", icon: "card", bg: "bg-amber-100", fg: "text-amber-700" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-2xl border border-ink-100 p-4">
                      <div className={`grid h-8 w-8 place-items-center rounded-lg ${s.bg} ${s.fg}`}>
                        <Icon name={s.icon} size={15} />
                      </div>
                      <div className="mt-3 text-[11px] font-bold tracking-wider text-ink-400 uppercase">
                        {s.label}
                      </div>
                      <div className="font-display mt-1 text-2xl font-extrabold text-ink-900 tabular-nums">
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </Container>
      </Section>

      {/* Trust strip */}
      <div className="border-y border-ink-150 bg-ink-50 py-8">
        <Container>
          <p className="text-center text-xs font-bold tracking-wider text-ink-400 uppercase">
            Trusted by agencies, freelancers, and product teams building on WordPress
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-lg font-bold text-ink-300">
            <span>Northloop Digital</span>
            <span>Fieldstack Plugins</span>
            <span>Rowhouse Agency</span>
            <span>Coastline Rentals</span>
          </div>
        </Container>
      </div>

      {/* Products */}
      <Section>
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              eyebrow="The product suite"
              title="Eleven products. One account."
              description="Run one, run all eleven — every WPistic product shares entitlements, billing, and customer data through the same dashboard."
            />
            <Button href="/products" variant="outline" icon="arrow">
              Browse all products
            </Button>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </Container>
      </Section>

      {/* How it works */}
      <Section className="bg-ink-50">
        <Container>
          <SectionHeading
            eyebrow="Why one ecosystem"
            title="Every product is built to work with the others"
            align="center"
          />
          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {howItWorks.map((step, i) => (
              <div key={step.title} className="relative">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-purple-500 text-white shadow-[0_8px_24px_rgba(108,92,231,0.35)]">
                  <Icon name={step.icon} size={22} />
                </div>
                <h3 className="font-display mt-5 text-lg font-bold text-ink-900">{step.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-600">{step.body}</p>
                {i < howItWorks.length - 1 && (
                  <Icon
                    name="arrow"
                    size={20}
                    className="absolute top-5 -right-4 hidden text-ink-300 sm:block"
                  />
                )}
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* Stats */}
      <Section>
        <Container>
          <div className="grid grid-cols-2 gap-8 rounded-[2rem] border border-ink-150 bg-white p-10 sm:grid-cols-4 sm:p-14">
            <Stat value="11" label="Products in the suite" />
            <Stat value="1" label="Dashboard login" />
            <Stat value="13mo" label="Analytics retention, no sampling" />
            <Stat value="14-day" label="Free trial, every plan" />
          </div>
        </Container>
      </Section>

      {/* Testimonials */}
      <Section className="bg-ink-50">
        <Container>
          <SectionHeading eyebrow="Customer stories" title="Built for people running real WordPress businesses" />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {testimonials.map((t) => (
              <TestimonialCard key={t.name} testimonial={t} />
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm font-semibold text-purple-600 hover:text-purple-700">
              Read full customer stories <Icon name="arrow" size={14} />
            </Link>
          </div>
        </Container>
      </Section>

      {/* Pricing preview */}
      <Section>
        <Container>
          <Card dark className="grid gap-10 overflow-hidden p-10 sm:p-14 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge tone="green" dot>
                Simple pricing
              </Badge>
              <h2 className="font-display mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Free to start. One bill once you grow.
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-300">
                Every plan includes a 14-day trial of the full suite. From a single free product
                to an unlimited agency account — see exactly what's included on the pricing page.
              </p>
              <Button href="/pricing" variant="white" size="lg" className="mt-8" icon="arrow">
                View full pricing
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { name: "Free", price: "$0", note: "1 product, 1 site" },
                { name: "Professional", price: "$79", note: "All products, 3 sites" },
                { name: "Agency", price: "$399", note: "Unlimited sites" },
                { name: "Enterprise", price: "Custom", note: "SSO & SLAs" },
              ].map((p) => (
                <div key={p.name} className="rounded-2xl border border-white/15 bg-white/5 p-5">
                  <div className="text-sm font-semibold text-white">{p.name}</div>
                  <div className="font-display mt-1 text-2xl font-extrabold text-white">{p.price}</div>
                  <div className="mt-1 text-xs text-ink-300">{p.note}</div>
                </div>
              ))}
            </div>
          </Card>
        </Container>
      </Section>

      {/* FAQ */}
      <Section className="bg-ink-50">
        <Container className="max-w-3xl">
          <SectionHeading eyebrow="Questions" title="Frequently asked questions" align="center" />
          <div className="mt-10">
            <FaqAccordion items={pricingFaqs} />
          </div>
        </Container>
      </Section>

      {/* Final CTA */}
      <Section>
        <Container className="text-center">
          <h2 className="font-display mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-4xl">
            Bring your WordPress site into the WPistic ecosystem
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-600">
            Start free with one product, or talk to us about running the full suite across your
            agency's client sites.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/pricing" variant="green" size="lg" icon="arrow">
              Start free
            </Button>
            <Button href="/contact" variant="outline" size="lg">
              Talk to sales
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
