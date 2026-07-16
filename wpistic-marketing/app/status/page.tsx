import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Status",
  description:
    "Current system status for WPistic products and infrastructure.",
};

const components = [
  { name: "Dashboard", icon: "chart" },
  { name: "REST API", icon: "code" },
  { name: "Chatbotistic AI service", icon: "chat" },
  { name: "Licensing service", icon: "key" },
  { name: "Billing & subscriptions", icon: "card" },
  { name: "Website (this site)", icon: "globe" },
];

export default function StatusPage() {
  return (
    <>
      <Section className="pt-16 pb-8 sm:pt-24">
        <Container>
          <Eyebrow>Status</Eyebrow>
          <h1 className="font-display mt-4 max-w-2xl text-4xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-5xl">
            System status
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">
            A snapshot of how WPistic's core systems are running.
          </p>
        </Container>
      </Section>

      <Section className="pt-4">
        <Container>
          <div className="flex flex-wrap items-center gap-4 rounded-[2rem] border border-ink-150 bg-white p-8 sm:p-10">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-green-100 text-green-700">
              <Icon name="check" size={24} />
            </div>
            <div>
              <div className="font-display text-xl font-extrabold text-ink-900">
                All systems operational
              </div>
              <Badge tone="green" dot className="mt-2">
                Operational
              </Badge>
            </div>
          </div>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container>
          <SectionHeading eyebrow="Components" title="Status by system" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {components.map((c) => (
              <Card key={c.name} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink-100 text-ink-600">
                    <Icon name={c.icon} size={18} />
                  </div>
                  <span className="text-[15px] font-semibold text-ink-900">{c.name}</span>
                </div>
                <Badge tone="green" dot>
                  Operational
                </Badge>
              </Card>
            ))}
          </div>
          <p className="mt-6 max-w-2xl text-[13.5px] leading-relaxed text-ink-500">
            Status shown reflects typical operation, not a live incident feed — this page isn't
            currently wired up to real-time infrastructure monitoring. For live incident history
            and any active alerts, check your WPistic dashboard.
          </p>
        </Container>
      </Section>

      <Section className="bg-ink-50">
        <Container className="text-center">
          <h2 className="font-display mx-auto max-w-xl text-2xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-3xl">
            Something look wrong on your end?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-ink-600">
            Report an issue and we'll take a look, even if it's not reflected here yet.
          </p>
          <div className="mt-7">
            <Button href={`mailto:${site.supportEmail}`} variant="green" size="lg" icon="mail">
              Report an issue
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
