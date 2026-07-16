import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Affiliate program",
  description:
    "Earn recurring commission recommending WPistic to your audience, clients, or community.",
};

const steps = [
  {
    icon: "users",
    title: "Sign up",
    body: "Tell us where you'll be sharing WPistic — a blog, a YouTube channel, an agency client list, a community. We approve most applications quickly.",
  },
  {
    icon: "arrow-up-right",
    title: "Share your link",
    body: "Get a unique referral link and drop it anywhere: a review, a tutorial, a resource page, or a direct recommendation to a client.",
  },
  {
    icon: "card",
    title: "Earn recurring commission",
    body: "When someone subscribes through your link, you earn commission on their subscription for as long as they stay a customer — not just a one-time payout.",
  },
];

const benefits = [
  {
    icon: "card",
    title: "Recurring commission",
    body: "Illustrative program terms: 20% recurring commission for the referred customer's first 12 months on a paid plan.",
  },
  {
    icon: "chart",
    title: "Real-time dashboard",
    body: "Track clicks, signups, and commission through the same WPistic dashboard your referrals use — no separate affiliate portal to log into.",
  },
  {
    icon: "layers",
    title: "Marketing assets provided",
    body: "Product screenshots, logos, and copy you can drop straight into a review, a comparison post, or a client recommendation.",
  },
  {
    icon: "handshake",
    title: "Dedicated affiliate support",
    body: "A direct line to the team for questions about attribution, payouts, or which product fits a specific audience best.",
  },
];

export default function AffiliatePage() {
  return (
    <>
      <Section className="pt-16 pb-12 sm:pt-24">
        <Container>
          <Eyebrow>Affiliate program</Eyebrow>
          <h1 className="font-display mt-4 max-w-2xl text-4xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-5xl">
            Earn recurring commission recommending WPistic
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">
            If you're already recommending WordPress tools to an audience or to clients, get paid
            for the recommendations you're making anyway.
          </p>
          <div className="mt-8">
            <Button
              href={`mailto:${site.salesEmail}?subject=${encodeURIComponent("Affiliate program interest")}`}
              variant="green"
              size="lg"
              icon="arrow"
            >
              Apply to the affiliate program
            </Button>
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50 pt-0">
        <Container>
          <SectionHeading eyebrow="How it works" title="Three steps to start earning" align="center" />
          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {steps.map((step, i) => (
              <div key={step.title} className="relative">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-purple-500 text-white shadow-[0_8px_24px_rgba(108,92,231,0.35)]">
                  <Icon name={step.icon} size={22} />
                </div>
                <h3 className="font-display mt-5 text-lg font-bold text-ink-900">{step.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-600">{step.body}</p>
                {i < steps.length - 1 && (
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

      <Section>
        <Container>
          <SectionHeading eyebrow="What you get" title="Built for people already recommending tools" />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((b) => (
              <Card key={b.title}>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-purple-100 text-purple-600">
                  <Icon name={b.icon} size={20} />
                </div>
                <h3 className="font-display mt-4 text-base font-bold text-ink-900">{b.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-600">{b.body}</p>
              </Card>
            ))}
          </div>
          <p className="mt-6 text-xs text-ink-400">
            Commission rate and term shown above are illustrative example program terms — exact
            terms are confirmed when your application is approved.
          </p>
        </Container>
      </Section>

      <Section className="bg-ink-50">
        <Container className="text-center">
          <h2 className="font-display mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-4xl">
            Already recommending WPistic to your audience?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-600">
            Reach out and we'll set you up with a referral link and the assets to go with it.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              href={`mailto:${site.salesEmail}?subject=${encodeURIComponent("Affiliate program interest")}`}
              variant="green"
              size="lg"
              icon="arrow"
            >
              Apply to the affiliate program
            </Button>
            <Button href="/partners" variant="outline" size="lg">
              Looking for the partner program?
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
