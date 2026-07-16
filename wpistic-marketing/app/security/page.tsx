import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How WPistic protects customer data — encryption, access controls, infrastructure practices, patching cadence, and how to report a vulnerability.",
};

const practices = [
  {
    icon: "lock",
    title: "Encryption in transit and at rest",
    body: "All traffic between your site, the WPistic dashboard, and our APIs is encrypted over TLS. Customer data is encrypted at rest in our database and backup storage.",
  },
  {
    icon: "shield",
    title: "Access controls & role-based permissions",
    body: "Dashboard access is scoped per account, with role-based permissions for team members on Agency and Enterprise plans. Internal access to production systems is limited to the engineers who need it, and logged.",
  },
  {
    icon: "server",
    title: "Infrastructure & hosting",
    body: "WPistic runs on reputable cloud infrastructure with isolated environments per service, automated backups, and network-level access restrictions between production and everything else.",
  },
  {
    icon: "refresh",
    title: "Patching & update cadence",
    body: "Dependencies and platform components are monitored for known vulnerabilities and patched on a regular cadence, with critical security fixes shipped outside the normal release schedule.",
  },
  {
    icon: "check-shield",
    title: "Compliance posture",
    body: "We're an early-stage company and don't hold formal certifications like SOC 2 or ISO 27001 today. Formal compliance work is on our roadmap as we grow — we'd rather say that plainly than claim something we haven't earned.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <Section className="pt-16 pb-12 sm:pt-24">
        <Container>
          <Eyebrow>Security</Eyebrow>
          <h1 className="font-display mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-5xl">
            How we protect your data
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-600">
            WPistic products handle real customer data — chat conversations, CRM records, booking
            details. Here's a plain-language look at how we approach security across the
            dashboard, the products, and the infrastructure behind them.
          </p>
        </Container>
      </Section>

      <Section className="bg-ink-50 pt-0">
        <Container>
          <SectionHeading eyebrow="Our approach" title="Concrete practices, not vague promises" />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {practices.map((p) => (
              <Card key={p.title}>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-purple-100 text-purple-600">
                  <Icon name={p.icon} size={20} />
                </div>
                <h3 className="font-display mt-4 text-base font-bold text-ink-900">{p.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-600">{p.body}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <Card dark className="grid gap-10 overflow-hidden p-10 sm:p-14 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge tone="green" dot>
                Report a vulnerability
              </Badge>
              <h2 className="font-display mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Found a security issue? Tell us directly.
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-300">
                We take security reports seriously and welcome responsible disclosure. Email us
                with details — what you found, how to reproduce it, and its potential impact — and
                we'll respond within 1 business day.
              </p>
              <Button
                href={`mailto:${site.securityEmail}`}
                external
                variant="white"
                size="lg"
                className="mt-8"
              >
                {site.securityEmail}
              </Button>
            </div>
            <div className="grid gap-4">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
                <div className="text-sm font-semibold text-white">What to include</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">
                  Affected product or endpoint, steps to reproduce, and any proof-of-concept
                  details that help us confirm the issue quickly.
                </p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
                <div className="text-sm font-semibold text-white">What we ask in return</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">
                  Give us a reasonable window to investigate and patch before any public
                  disclosure. Please avoid accessing or modifying data that isn't yours.
                </p>
              </div>
            </div>
          </Card>
        </Container>
      </Section>
    </>
  );
}
