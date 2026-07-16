import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { site } from "@/lib/site";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the WPistic team — sales questions, support requests, or anything else. We reply within one business day.",
};

const contactCards = [
  {
    icon: "handshake",
    title: "Talk to sales",
    body: "Questions about plans, bundles, or rolling WPistic out across an agency's client sites.",
    email: site.salesEmail,
  },
  {
    icon: "chat",
    title: "Get support",
    body: "Already a customer? Reach the team that builds the products for setup help or a bug report.",
    email: site.supportEmail,
  },
];

export default function ContactPage() {
  return (
    <Section className="pt-16 pb-20 sm:pt-24">
      <Container>
        <Eyebrow>Contact</Eyebrow>
        <h1 className="font-display mt-4 max-w-2xl text-4xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-5xl">
          Talk to a real person on the team
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">
          No ticket queue, no chatbot loop — email goes straight to the people who build and
          support WPistic. We reply within 1 business day.
        </p>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
          <div className="grid gap-6">
            {contactCards.map((c) => (
              <Card key={c.title}>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-purple-100 text-purple-600">
                  <Icon name={c.icon} size={20} />
                </div>
                <h2 className="font-display mt-4 text-lg font-bold text-ink-900">{c.title}</h2>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-600">{c.body}</p>
                <a
                  href={`mailto:${c.email}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-purple-600 hover:text-purple-700"
                >
                  {c.email} <Icon name="arrow" size={14} />
                </a>
              </Card>
            ))}

            <div className="rounded-2xl border border-ink-150 bg-ink-50 p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <Icon name="check" size={16} className="text-green-600" />
                Response times
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
                We reply to every message within 1 business day. Support requests from active
                customers are prioritized first.
              </p>
            </div>
          </div>

          <Card className="h-fit">
            <h2 className="font-display text-lg font-bold text-ink-900">Send a message</h2>
            <p className="mt-1.5 text-[14px] text-ink-500">
              Fill this out and we'll open a pre-filled email to our support inbox in your mail
              app — nothing is stored or sent from this page.
            </p>
            <div className="mt-6">
              <ContactForm />
            </div>
          </Card>
        </div>
      </Container>
    </Section>
  );
}
