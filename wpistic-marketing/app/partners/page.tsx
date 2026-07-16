import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "Partners",
  description:
    "Agencies and consultants implementing WPistic for clients — referral and certified implementation partner tiers.",
};

const tiers = [
  {
    tone: "purple" as const,
    badge: "Referral partners",
    title: "For agencies pointing clients toward WPistic",
    body: "For agencies and consultants who recommend WPistic to clients but don't necessarily implement it themselves.",
    features: [
      "Reseller-friendly pricing for client accounts you manage",
      "Co-marketing opportunities — case studies, joint content, directory listing",
      "Priority email support for your client accounts",
      "Access to the same marketing assets as the affiliate program",
    ],
  },
  {
    tone: "green" as const,
    badge: "Certified implementation partners",
    title: "For agencies that build and support WPistic sites",
    body: "For agencies and freelancers who install, configure, and support WPistic products directly as part of client delivery work.",
    features: [
      "Everything in Referral partners",
      "Reseller pricing across the full product suite, not per-product",
      "A dedicated partner manager for account and roadmap questions",
      "Early access to new products and beta features before public release",
      "Listed in the partner directory as a certified implementer",
    ],
  },
];

export default function PartnersPage() {
  return (
    <>
      <Section className="pt-16 pb-12 sm:pt-24">
        <Container>
          <Eyebrow>Partners</Eyebrow>
          <h1 className="font-display mt-4 max-w-2xl text-4xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-5xl">
            Build and support client sites on WPistic
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">
            The partner program is for agencies and consultants implementing WPistic for clients —
            not just referring it. Two tiers, depending on how deep the relationship goes.
          </p>
          <div className="mt-8">
            <Button href="/contact" variant="green" size="lg" icon="arrow">
              Apply to the partner program
            </Button>
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50 pt-0">
        <Container>
          <SectionHeading eyebrow="Partner tiers" title="Two tiers, depending on how you work with clients" />
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {tiers.map((tier) => (
              <Card key={tier.badge} className="flex flex-col">
                <Badge tone={tier.tone}>{tier.badge}</Badge>
                <h3 className="font-display mt-4 text-xl font-bold text-ink-900">{tier.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-600">{tier.body}</p>
                <ul className="mt-6 flex-1 space-y-3">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <Icon name="check" size={16} className="mt-0.5 shrink-0 text-green-600" />
                      <span className="text-[14px] text-ink-700">{f}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading eyebrow="Why partner with us" title="Built for how agencies actually deliver client work" />
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            <div>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-purple-100 text-purple-600">
                <Icon name="layers" size={20} />
              </div>
              <h3 className="font-display mt-4 text-base font-bold text-ink-900">
                One stack per client, not eleven decisions
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-600">
                Standardize client builds on a suite that already integrates, instead of
                re-evaluating tooling on every project.
              </p>
            </div>
            <div>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-purple-100 text-purple-600">
                <Icon name="chart" size={20} />
              </div>
              <h3 className="font-display mt-4 text-base font-bold text-ink-900">
                One dashboard across every client site
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-600">
                Manage licenses, plans, and usage for your whole client roster from a single
                WPistic account.
              </p>
            </div>
            <div>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-purple-100 text-purple-600">
                <Icon name="handshake" size={20} />
              </div>
              <h3 className="font-display mt-4 text-base font-bold text-ink-900">
                A direct line to the team building it
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-600">
                Certified partners get a dedicated partner manager instead of a general support
                queue for account and roadmap questions.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50">
        <Container className="text-center">
          <h2 className="font-display mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-4xl">
            Implementing WPistic for clients already?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-600">
            Apply to the partner program and we'll follow up about which tier fits how your agency
            works.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/contact" variant="green" size="lg" icon="arrow">
              Apply to the partner program
            </Button>
            <Button href="/affiliate" variant="outline" size="lg">
              Just want to refer clients?
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
