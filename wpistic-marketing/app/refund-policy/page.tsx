import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "How free trials, monthly and annual billing, cancellations, and refunds work across WPistic subscriptions.",
};

const LAST_UPDATED = "June 1, 2026";

export default function RefundPolicyPage() {
  return (
    <Section className="pt-16 pb-20 sm:pt-24">
      <Container className="max-w-3xl">
        <Eyebrow>Legal</Eyebrow>
        <h1 className="font-display mt-4 text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl">
          Refund Policy
        </h1>
        <p className="mt-3 text-sm text-ink-500">Last updated: {LAST_UPDATED}</p>

        <p className="mt-8 text-ink-600 leading-relaxed mb-4">
          This Refund Policy explains how billing, cancellations, and refunds work for paid{" "}
          {site.name} subscriptions. It should be read alongside our{" "}
          <Link href="/terms" className="text-purple-600 hover:underline">
            Terms of Service
          </Link>
          , which governs your subscription more broadly.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          1. Free Trial
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Starter, Professional, and Business plans include a 14-day free trial. You won't be
          charged during the trial, and you can cancel at any time before it ends from the
          dashboard without being billed. If you don't cancel, your subscription converts
          automatically to a paid plan at the end of the trial and billing begins on the plan and
          cycle you selected when you signed up.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          2. Monthly Subscriptions
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Monthly plans are billed at the start of each billing cycle. If you cancel, you'll retain
          access through the end of the billing period you've already paid for, and your
          subscription will not renew. We generally don't issue prorated refunds for the unused
          portion of a monthly billing period, except where required by law or as described in the
          exceptions below.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          3. Annual Subscriptions
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Annual plans are billed once per year at a discounted rate compared to paying monthly. If
          you cancel an annual plan within the first 30 days of a new annual billing cycle, contact{" "}
          <a href={`mailto:${site.supportEmail}`} className="text-purple-600 hover:underline">
            {site.supportEmail}
          </a>{" "}
          and we'll issue a full refund for that cycle. After the first 30 days, annual
          subscriptions are non-refundable for the remainder of the term, though you're welcome to
          cancel auto-renewal at any time so the plan does not renew into a new annual term.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          4. How to Request a Refund or Cancel
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          You can cancel your subscription at any time from the billing section of your dashboard —
          cancellation takes effect at the end of your current billing period. To request a refund
          under the terms above, email{" "}
          <a href={`mailto:${site.supportEmail}`} className="text-purple-600 hover:underline">
            {site.supportEmail}
          </a>{" "}
          with your account email and the reason for the request. We aim to respond to every refund
          request within 2 business days.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          5. What Happens to Your Access After Cancellation or Refund
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Canceling or receiving a refund doesn't delete your data. Instead, any product no longer
          covered by your plan moves into a read-only, "reconnect to restore" state — your
          configuration, chat history, CRM records, and analytics stay intact, but the product
          stops actively running on your site until you resubscribe. This is intentional: it means
          resubscribing later restores your setup instead of asking you to rebuild it from scratch.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          6. Exceptions
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          We reserve the right to decline a refund request where we have a good-faith basis to
          believe it involves abuse of this policy, fraud, chargebacks filed in bad faith, or a
          violation of our{" "}
          <Link href="/terms" className="text-purple-600 hover:underline">
            Terms of Service
          </Link>
          's acceptable use provisions. Accounts terminated for violating our acceptable use policy
          are not eligible for a refund of amounts already paid.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          7. Processing Time
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Approved refunds are issued to your original payment method through our payment
          processor. Refunds typically appear on your statement within 5–10 business days,
          depending on your bank or card issuer's own processing times, which are outside our
          control.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          8. Contact Us
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Questions about billing or refunds can be sent to{" "}
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
