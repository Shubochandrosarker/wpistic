import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { site } from "@/lib/site";
import { testimonials } from "@/lib/testimonials";

export const metadata: Metadata = {
  title: "Log in",
  description:
    "Log in to your WPistic dashboard to manage every product, license, and connected site from one account.",
};

const highlights = [
  {
    icon: "layers",
    title: "One dashboard, every product",
    body: "Chat, CRM, bookings, memberships, analytics, and licensing, all under one login.",
  },
  {
    icon: "crm",
    title: "Data that moves with you",
    body: "A conversation becomes a CRM contact. A booking updates your analytics. Automatically.",
  },
  {
    icon: "shield",
    title: "One bill, one account",
    body: "Manage licenses and billing for every connected site without juggling separate logins.",
  },
];

const testimonial = testimonials[0];

export default function LoginPage() {
  return (
    <Section className="pt-16 pb-20 sm:pt-24">
      <Container className="max-w-5xl">
        <div className="grid overflow-hidden rounded-[28px] border border-ink-150 shadow-[var(--shadow-lg)] lg:grid-cols-2">
          {/* Form panel */}
          <div className="order-1 bg-white p-8 sm:p-12 lg:order-2">
            <Eyebrow>Welcome back</Eyebrow>
            <h1 className="font-display mt-4 text-3xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-4xl">
              Log in to WPistic
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-600">
              This marketing site doesn't hold your account — {site.name} logins live on your
              dashboard at{" "}
              <span className="font-semibold text-ink-800">app.wpistic.com</span>. Continue there
              to sign in securely.
            </p>

            <div className="mt-8 grid gap-4">
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
              Sign-in happens on your WPistic dashboard — the button below takes you there. Nothing
              on this page is submitted or stored.
            </p>

            <Button
              href={site.loginUrl}
              external
              variant="green"
              size="lg"
              icon="arrow-up-right"
              className="mt-5 w-full"
            >
              Continue to log in
            </Button>

            <div className="mt-8 border-t border-ink-100 pt-6 text-center text-[14.5px] text-ink-600">
              New here?{" "}
              <Link href="/register" className="font-semibold text-purple-600 hover:text-purple-700">
                Create an account
              </Link>
              <span className="px-2 text-ink-300">·</span>
              <Link href="/pricing" className="font-semibold text-purple-600 hover:text-purple-700">
                Compare plans
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
              <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-white/70">
                {site.tagline}. One login for every WordPress-native product your business runs
                on.
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
