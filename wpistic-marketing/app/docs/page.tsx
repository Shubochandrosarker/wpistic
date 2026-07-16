import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Find your way around WPistic — installing products, managing workspaces, the REST API, webhooks, licensing, and troubleshooting.",
};

const categories: { icon: string; title: string; body: string; href?: string }[] = [
  {
    icon: "cube",
    title: "Getting started",
    body: "Create your account, install your first product, and connect your first WordPress site.",
  },
  {
    icon: "download",
    title: "Installing a product",
    body: "Install and activate any of the eleven WPistic products on a new or existing WordPress site.",
  },
  {
    icon: "code",
    title: "REST API reference",
    body: "Authenticate with an API key and call the wpistic/v1 namespace from your own systems.",
    href: "/developers",
  },
  {
    icon: "zap",
    title: "Webhooks",
    body: "Subscribe to license and plan-change events instead of polling the API for updates.",
    href: "/developers",
  },
  {
    icon: "card",
    title: "Licensing & billing",
    body: "How license keys, activation limits, plan changes, and invoices work across the suite.",
  },
  {
    icon: "layers",
    title: "Workspaces & teams",
    body: "Manage multiple sites and teammates under one shared workspace and billing account.",
  },
  {
    icon: "refresh",
    title: "Troubleshooting",
    body: "Common activation errors, sync issues, and what to check before contacting support.",
    href: "/support",
  },
];

export default function DocsPage() {
  return (
    <>
      <Section className="pt-16 pb-12 sm:pt-24">
        <Container>
          <div className="max-w-2xl">
            <Eyebrow>Documentation</Eyebrow>
            <h1 className="font-display mt-4 text-4xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-5xl">
              Everything you need to run WPistic
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-ink-600">
              Guides for installing products, managing workspaces, and integrating with the REST
              API — organized by what you&apos;re trying to do.
            </p>
          </div>

          <div className="relative mt-10 max-w-xl">
            <Icon
              name="search"
              size={18}
              className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-ink-400"
            />
            <input
              type="text"
              placeholder="Search the documentation"
              disabled
              aria-label="Search the documentation"
              className="w-full rounded-full border border-ink-150 bg-white py-3.5 pr-5 pl-12 text-[15px] text-ink-400 placeholder:text-ink-400 disabled:cursor-not-allowed"
            />
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50 pt-8">
        <Container>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => {
              const inner = (
                <>
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-purple-100 text-purple-600">
                    <Icon name={cat.icon} size={20} />
                  </div>
                  <h3 className="font-display mt-4 text-lg font-bold text-ink-900">{cat.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-ink-600">{cat.body}</p>
                </>
              );
              return cat.href ? (
                <a
                  key={cat.title}
                  href={cat.href}
                  className="rounded-[20px] border border-ink-150 bg-white p-6 shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]"
                >
                  {inner}
                </a>
              ) : (
                <Card key={cat.title}>{inner}</Card>
              );
            })}
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="text-center">
          <h2 className="font-display mx-auto max-w-xl text-3xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-4xl">
            Can&apos;t find what you need?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-lg text-ink-600">
            Our support team can point you to the right guide, or help directly if something isn&apos;t
            working.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/support" variant="green" size="lg" icon="arrow">
              Contact support
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
