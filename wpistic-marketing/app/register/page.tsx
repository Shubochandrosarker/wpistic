import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Badge } from "@/components/ui/Badge";
import { site } from "@/lib/site";
import { testimonials } from "@/lib/testimonials";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Create your WPistic account to claim free product access without a card. Paid plans are coming soon.",
};

const highlights = [
  {
    icon: "sparkle",
    title: "Start free, no card required",
    body: "One WPistic product on one site, free, for as long as you want to try it.",
  },
  {
    icon: "refresh",
    title: "Paid plans coming soon",
    body: "Start with free product access now; paid checkout will open only after the billing account and webhooks are ready.",
  },
  {
    icon: "layers",
    title: "Every product, one signup",
    body: "Chat, CRM, bookings, memberships, analytics, and licensing share the same account.",
  },
];

const testimonial = testimonials[1];

export default function RegisterPage() {
  return (
    <Section className="pt-16 pb-20 sm:pt-24">
      <Container className="max-w-5xl">
        <div className="grid overflow-hidden rounded-[28px] border border-ink-150 shadow-[var(--shadow-lg)] lg:grid-cols-2">
          {/* Form panel */}
          <div className="order-1 bg-white p-8 sm:p-12 lg:order-2">
            <Eyebrow>Get started</Eyebrow>
            <h1 className="font-display mt-4 text-3xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-4xl">
              Create your WPistic account
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-600">
              Accounts are created on the {site.name} sign-up page at{" "}
              <span className="font-semibold text-ink-800">account.wpistic.com</span>, not on this
              marketing site. Continue there to finish signing up in under a minute — you'll land
              in your dashboard straight afterwards.
            </p>

            <div className="mt-8 grid gap-4">
              <label className="block">
                <span className="text-[13px] font-semibold text-ink-700">Name</span>
                <input
                  type="text"
                  placeholder="Jane Cooper"
                  className="mt-1.5 w-full rounded-xl border border-ink-150 bg-ink-50 px-4 py-2.5 text-[15px] text-ink-900 placeholder:text-ink-400 focus:border-purple-300 focus:bg-white focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-semibold text-ink-700">Email address</span>
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="mt-1.5 w-full rounded-xl border border-ink-150 bg-ink-50 px-4 py-2.5 text-[15px] text-ink-900 placeholder:text-ink-400 focus:border-purple-300 focus:bg-white focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-semibold text-ink-700">Password</span>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-xl border border-ink-150 bg-ink-50 px-4 py-2.5 text-[15px] text-ink-900 placeholder:text-ink-400 focus:border-purple-300 focus:bg-white focus:outline-none"
                />
              </label>
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-[12.5px] leading-relaxed text-ink-500">
              <Icon name="lock" size={14} className="mt-0.5 shrink-0 text-ink-400" />
              Account creation happens on the WPistic sign-up page — the button below takes you
              there. Nothing on this page is submitted or stored.
            </p>

            <Button
              href={site.registerUrl}
              external
              variant="green"
              size="lg"
              icon="arrow-up-right"
              className="mt-5 w-full"
            >
              Continue to create account
            </Button>

            <div className="mt-8 border-t border-ink-100 pt-6 text-center text-[14.5px] text-ink-600">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-purple-600 hover:text-purple-700">
                Log in
              </Link>
              <span className="px-2 text-ink-300">·</span>
              <Link href="/pricing" className="font-semibold text-purple-600 hover:text-purple-700">
                Compare plans first
              </Link>
            </div>
          </div>

          {/* Brand panel */}
          <div className="order-2 flex flex-col justify-between bg-ink-900 p-8 text-white sm:p-10 lg:order-1">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="h-8 w-8 rounded-lg bg-purple-500" aria-hidden="true" />
                <span className="font-display text-lg font-extrabold tracking-tight">
                  {site.name}
                </span>
              </div>
              <Badge tone="green" className="mt-6">
                Card-free free access
              </Badge>
              <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/70">
                {site.tagline}. Start free with one product; paid plans are coming soon.
              </p>

              <div className="mt-8 grid gap-5">
                {highlights.map((h) => (
                  <div key={h.title} className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-green-400">
                      <Icon name={h.icon} size={17} />
                    </div>
                    <div>
                      <div className="text-[14.5px] font-bold">{h.title}</div>
                      <div className="mt-0.5 text-[13.5px] leading-relaxed text-white/60">
                        {h.body}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5">
              <Icon name="quote" size={20} className="text-purple-300" />
              <p className="mt-3 text-[13.5px] leading-relaxed text-white/80">
                "{testimonial.quote}"
              </p>
              <div className="mt-4 text-[13px] font-semibold">
                {testimonial.name}
                <span className="font-normal text-white/50">
                  {" "}
                  · {testimonial.role}, {testimonial.company}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
