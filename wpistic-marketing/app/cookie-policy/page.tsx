import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "The cookies WPistic uses across the dashboard and marketing site, why we use them, and how to manage or disable them in your browser.",
};

const LAST_UPDATED = "June 1, 2026";

export default function CookiePolicyPage() {
  return (
    <Section className="pt-16 pb-20 sm:pt-24">
      <Container className="max-w-3xl">
        <Eyebrow>Legal</Eyebrow>
        <h1 className="font-display mt-4 text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl">
          Cookie Policy
        </h1>
        <p className="mt-3 text-sm text-ink-500">Last updated: {LAST_UPDATED}</p>

        <p className="mt-8 text-ink-600 leading-relaxed mb-4">
          This Cookie Policy explains how {site.name} uses cookies and similar technologies on{" "}
          {site.domain} and the {site.name} dashboard, and the choices available to you. It should
          be read alongside our{" "}
          <Link href="/privacy" className="text-purple-600 hover:underline">
            Privacy Policy
          </Link>
          , which covers how we handle personal data more broadly.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          1. What Are Cookies
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Cookies are small text files stored on your device by your browser when you visit a
          website. They let a site remember information about your visit — like whether you're
          logged in, or how you found the page — across requests and, in some cases, across
          separate visits. We also use similar technologies such as local storage, which behaves
          like a cookie but is stored differently by the browser; for simplicity, this policy
          refers to all of these collectively as "cookies."
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          2. Categories of Cookies We Use
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">We use three categories of cookies:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-ink-600 mb-4">
          <li>
            <span className="font-semibold text-ink-800">Strictly necessary cookies.</span>{" "}
            Session and authentication cookies that keep you logged into the dashboard, protect
            against cross-site request forgery, and remember items like your cookie consent
            choice. These cookies can't be switched off without breaking core functionality, and
            we don't ask for consent to set them.
          </li>
          <li>
            <span className="font-semibold text-ink-800">Analytics cookies.</span> Used by
            Insightistic and our own site analytics to understand aggregate traffic patterns, which
            pages are visited, and how visitors move through the dashboard and marketing site. This
            helps us fix what's broken and prioritize what to build next.
          </li>
          <li>
            <span className="font-semibold text-ink-800">Preference cookies.</span> Remember
            settings you've chosen, such as light/dark theme, dashboard layout preferences, or
            dismissed onboarding prompts, so you don't have to reset them on every visit.
          </li>
        </ul>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          3. First-Party vs. Third-Party Cookies
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Most cookies on {site.domain} and the {site.name} dashboard are first-party cookies, set
          directly by {site.name} to operate the Services. We keep third-party cookies to a
          minimum. Where a connected product embeds a widget on your own website — such as the
          Chatbotistic chat widget — that widget may set its own first-party cookie on your site's
          domain (not ours) to keep track of an ongoing conversation for your visitors.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          4. How to Manage or Disable Cookies
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          You can control non-essential cookies in two ways: through the cookie preferences banner
          shown on your first visit, or directly in your browser settings. Most browsers let you
          view, delete, and block cookies from their settings menu — look for a "Privacy" or
          "Cookies" section. Blocking strictly necessary cookies will prevent you from staying
          logged into the dashboard, and blocking analytics or preference cookies won't affect core
          functionality, only personalization and the data we can see about how the Services are
          used.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          5. Do Not Track
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Some browsers offer a "Do Not Track" (DNT) signal. There isn't yet a common industry
          standard for how sites should respond to DNT, so we currently don't alter our data
          collection practices in response to a DNT signal. You can still manage cookies directly as
          described above.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          6. Changes to This Policy
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          We may update this Cookie Policy as our use of cookies changes. We'll update the "Last
          updated" date above when we do, and where changes are material, we'll provide additional
          notice through the dashboard or the cookie preferences banner.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          7. Contact Us
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Questions about this Cookie Policy can be sent to{" "}
          <a href={`mailto:${site.supportEmail}`} className="text-purple-600 hover:underline">
            {site.supportEmail}
          </a>
          .
        </p>

        <p className="mt-12 text-sm text-ink-400 italic">
          This policy is provided as a general template and should be reviewed by qualified
          counsel before commercial use.
        </p>
      </Container>
    </Section>
  );
}
