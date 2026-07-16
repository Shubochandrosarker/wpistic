import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Developers",
  description:
    "Build on the WPistic REST API — automate license activation, workspace management, and product provisioning across the suite.",
};

const features = [
  {
    icon: "code",
    title: "REST API",
    body: "The wpistic/v1 namespace exposes your workspace, websites, products, and licenses over standard REST endpoints. Authenticate with an API key issued from the dashboard — no OAuth dance required for server-to-server use.",
  },
  {
    icon: "zap",
    title: "Webhooks",
    body: "Subscribe to license and plan-change events instead of polling. When a subscription upgrades, downgrades, or a license gets revoked, WPistic pushes a signed payload to your endpoint in near real time.",
  },
  {
    icon: "server",
    title: "Sandbox workspace",
    body: "Every account can spin up a sandbox workspace with test licenses and fake activations, so you can build and break your integration without touching a paying customer's data.",
  },
  {
    icon: "lock",
    title: "Rate limits & auth",
    body: "API keys are scoped to a single workspace and carry their own rate limit, so a runaway script in one integration can't affect another site you manage.",
  },
];

export default function DevelopersPage() {
  return (
    <>
      <Section className="pt-16 pb-20 sm:pt-24 sm:pb-28">
        <Container>
          <div className="max-w-2xl">
            <Eyebrow>Developers</Eyebrow>
            <h1 className="font-display mt-4 text-4xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-5xl">
              The WPistic REST API and webhooks, for automating your workspace
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-ink-600">
              Issue and revoke licenses, provision products across a client&apos;s sites, or react to
              plan changes the moment they happen — all through the same API that powers the
              WPistic dashboard itself.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/docs" variant="green" size="lg" icon="arrow">
                Read the docs
              </Button>
              <Button href={site.dashboardUrl} external variant="outline" size="lg">
                Get your API key
              </Button>
            </div>
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50">
        <Container>
          <SectionHeading
            eyebrow="What's available"
            title="Built for agencies and product teams automating the boring parts"
            description="Every product in the suite phones into the same workspace model, so one integration covers licenses, activations, and usage across all eleven."
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {features.map((f) => (
              <Card key={f.title}>
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-purple-100 text-purple-600">
                  <Icon name={f.icon} size={20} />
                </div>
                <h3 className="font-display mt-4 text-lg font-bold text-ink-900">{f.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-600">{f.body}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge tone="purple">Example request</Badge>
              <h2 className="font-display mt-4 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
                Authenticate with an API key, call any endpoint
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-600">
                Generate a key from your dashboard&apos;s Developers tab, then pass it as a bearer
                token. This illustrative call to the Me endpoint returns the workspace, plan, and
                products tied to that key.
              </p>
              <ul className="mt-6 space-y-3 text-[14.5px] text-ink-700">
                <li className="flex items-start gap-3">
                  <Icon name="check" size={16} className="mt-0.5 shrink-0 text-green-600" />
                  Keys are scoped to one workspace and can be revoked instantly
                </li>
                <li className="flex items-start gap-3">
                  <Icon name="check" size={16} className="mt-0.5 shrink-0 text-green-600" />
                  Every response includes the same shape the dashboard UI consumes
                </li>
              </ul>
            </div>
            <pre className="overflow-x-auto rounded-2xl bg-ink-900 p-5 text-sm font-mono text-white">
              <code>{`curl https://yoursite.com/wp-json/wpistic/v1/me \\
  -H "Authorization: Bearer wp_live_51a2b3c4d5e6f7..." \\
  -H "Accept: application/json"

# 200 OK
{
  "workspace": "northloop-digital",
  "plan": "professional",
  "products": ["chatbotistic", "crmistic", "bookingistic"],
  "sites_connected": 3
}`}</code>
            </pre>
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50">
        <Container className="text-center">
          <h2 className="font-display mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-4xl">
            Ready to build on WPistic?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-600">
            Read the full API reference and webhook event catalogue, or grab an API key and start
            calling endpoints against your sandbox workspace today.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/docs" variant="green" size="lg" icon="arrow">
              Full documentation
            </Button>
            <Button href={site.dashboardUrl} external variant="outline" size="lg">
              Get your API key
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
