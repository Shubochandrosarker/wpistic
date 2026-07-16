import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { FaqAccordion } from "@/components/ui/FaqAccordion";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get help with WPistic — browse the docs, email support, join the community discussion, or check the status page.",
};

const channels = [
  {
    icon: "layers",
    title: "Documentation",
    body: "Guides for installing products, managing workspaces, and using the REST API.",
    action: "Browse the docs",
    href: "/docs",
  },
  {
    icon: "mail",
    title: "Email support",
    body: `Send us the details and we'll get back to you within 1 business day.`,
    action: "Email support",
    href: `mailto:${site.supportEmail}`,
  },
  {
    icon: "chat",
    title: "Community discussion",
    body: "Ask questions and swap notes with other people running WPistic on client and personal sites.",
    action: "Join the discussion",
    href: "/contact",
  },
  {
    icon: "activity",
    title: "Status page",
    body: "Check current uptime and incident history for the dashboard and API.",
    action: "View status",
    href: "/status",
  },
];

const faqs = [
  {
    q: "How do I get my license key?",
    a: "License keys are issued automatically when you subscribe to a plan and are visible in your dashboard under each installed product. You can also fetch them via the REST API with an API key.",
  },
  {
    q: "What's your average response time?",
    a: "We reply to email support within 1 business day, and usually much sooner for account or billing issues.",
  },
  {
    q: "Do you offer phone support?",
    a: "Not currently — email is the fastest way to reach us, and Agency and Enterprise plans get a named point of contact for anything urgent.",
  },
  {
    q: "Where do I report a bug?",
    a: "Email support with steps to reproduce and which product and site it happened on. For anything security-related, please email us directly rather than posting in the community discussion.",
  },
  {
    q: "Can I get help installing a product on a client's site?",
    a: "Yes — Agency and Enterprise plans include setup guidance, and our documentation walks through installing each product on any WordPress site you manage.",
  },
];

export default function SupportPage() {
  return (
    <>
      <Section className="pt-16 pb-12 sm:pt-24">
        <Container>
          <div className="max-w-2xl">
            <Eyebrow>Support</Eyebrow>
            <h1 className="font-display mt-4 text-4xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-5xl">
              We're here when something doesn't work
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-ink-600">
              Start with the docs for how things are supposed to work, then reach out directly when
              you need a person.
            </p>
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50 pt-8">
        <Container>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {channels.map((c) => (
              <Card key={c.title} className="flex flex-col">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-purple-100 text-purple-600">
                  <Icon name={c.icon} size={20} />
                </div>
                <h3 className="font-display mt-4 text-lg font-bold text-ink-900">{c.title}</h3>
                <p className="mt-2 flex-1 text-[14.5px] leading-relaxed text-ink-600">{c.body}</p>
                <a
                  href={c.href}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-purple-600 hover:text-purple-700"
                >
                  {c.action} <Icon name="arrow" size={14} />
                </a>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-3xl">
          <SectionHeading eyebrow="Questions" title="Support FAQ" align="center" />
          <div className="mt-10">
            <FaqAccordion items={faqs} />
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50">
        <Container className="text-center">
          <h2 className="font-display mx-auto max-w-xl text-3xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-4xl">
            Still stuck?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-lg text-ink-600">
            Reach out and tell us what's going on — we'll point you in the right direction.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/contact" variant="green" size="lg" icon="arrow">
              Contact us
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
