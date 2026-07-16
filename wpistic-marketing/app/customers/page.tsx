import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Stat } from "@/components/ui/Stat";
import { TestimonialCard } from "@/components/ui/TestimonialCard";
import { customerStories, testimonials } from "@/lib/testimonials";

export const metadata: Metadata = {
  title: "Customers",
  description:
    "How agencies, plugin developers, and marketing teams run their businesses on the WPistic product suite — real results from real customer stories.",
};

const uniqueIndustries = new Set(customerStories.map((s) => s.industry)).size;
const uniqueProductsUsed = new Set(customerStories.flatMap((s) => s.productIds)).size;

export default function CustomersPage() {
  return (
    <>
      <Section className="pt-16 pb-8 sm:pt-24">
        <Container className="max-w-3xl text-center">
          <SectionHeading
            eyebrow="Customers"
            title="Built for people running real WordPress businesses"
            description="Agencies, plugin developers, and marketing teams already running client work and their own products on WPistic — in their own words."
            align="center"
          />
        </Container>
      </Section>

      <Section className="pt-4 pb-16">
        <Container>
          <div className="grid grid-cols-2 gap-8 rounded-[2rem] border border-ink-150 bg-white p-10 sm:grid-cols-3 sm:p-14">
            <Stat value={String(customerStories.length)} label="Full case studies" />
            <Stat value={String(uniqueIndustries)} label="Industries represented" />
            <Stat value={String(uniqueProductsUsed)} label="Products in active use" />
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50">
        <Container>
          <SectionHeading eyebrow="Case studies" title="Read the full stories" />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {customerStories.map((story) => (
              <Card key={story.slug} hoverable className="flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[15.5px] font-bold text-ink-900">{story.company}</span>
                  <Badge tone="purple">{story.industry}</Badge>
                </div>
                <p className="mt-3.5 flex-1 text-[13.5px] leading-relaxed text-ink-600">
                  {story.summary}
                </p>
                <div className="mt-5 grid grid-cols-1 gap-3 border-t border-ink-100 pt-5">
                  {story.results.slice(0, 2).map((r) => (
                    <div key={r.label}>
                      <div className="text-[13.5px] font-bold text-ink-900">{r.value}</div>
                      <div className="mt-0.5 text-xs text-ink-500">{r.label}</div>
                    </div>
                  ))}
                </div>
                <Link
                  href={`/customers/${story.slug}`}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-purple-600 hover:text-purple-700"
                >
                  Read case study <Icon name="arrow" size={14} />
                </Link>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading eyebrow="More social proof" title="What customers say about WPistic" />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {testimonials.map((t) => (
              <TestimonialCard key={t.name} testimonial={t} />
            ))}
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50">
        <Container className="text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
            Want results like these on your own sites?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-ink-600">
            Start free with one product, or talk to us about running the full suite across your
            team or agency.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
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
