import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of the WPistic dashboard, subscription billing, and the WordPress plugins in the WPistic product suite.",
};

const LAST_UPDATED = "June 1, 2026";

export default function TermsOfServicePage() {
  return (
    <Section className="pt-16 pb-20 sm:pt-24">
      <Container className="max-w-3xl">
        <Eyebrow>Legal</Eyebrow>
        <h1 className="font-display mt-4 text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-ink-500">Last updated: {LAST_UPDATED}</p>

        <p className="mt-8 text-ink-600 leading-relaxed mb-4">
          These Terms of Service ("Terms") form an agreement between you and {site.name} ("{site.name}
          ", "we", "us", or "our") governing your access to and use of {site.domain}, the {site.name}
          {" "}dashboard, and any product in the {site.name} suite (collectively, the "Services").
          By creating an account or using the Services, you agree to these Terms. If you're
          accepting these Terms on behalf of a company, you represent that you have the authority
          to bind that company.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          1. Acceptance of Terms
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          You must be at least 18 years old and able to form a binding contract to use the
          Services. If you do not agree to these Terms, do not create an account or use the
          Services. We may update these Terms from time to time as described in Section 12; your
          continued use of the Services after an update constitutes acceptance of the revised
          Terms.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          2. Description of Service
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          {site.name} is a suite of WordPress-native products — including Chatbotistic, Memberistic,
          Bookingistic, Insightistic, SEOistic, Postistic, CRMistic, and Licenseistic, among
          others — unified by a single customer dashboard, billing account, and login. Each product
          is delivered as a WordPress plugin activated on your own WordPress site(s), paired with
          cloud-hosted services (such as AI processing, analytics storage, and license
          verification) operated by {site.name}. Product availability, features, and pricing are
          described on our{" "}
          <Link href="/products" className="text-purple-600 hover:underline">
            Products
          </Link>{" "}
          and{" "}
          <Link href="/pricing" className="text-purple-600 hover:underline">
            Pricing
          </Link>{" "}
          pages, which may change over time.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          3. Account Registration &amp; Responsibilities
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          To use the Services, you must register a dashboard account with accurate, current
          information. You're responsible for maintaining the confidentiality of your login
          credentials and for all activity that occurs under your account, including actions taken
          by team members you invite. Notify us immediately at{" "}
          <a href={`mailto:${site.supportEmail}`} className="text-purple-600 hover:underline">
            {site.supportEmail}
          </a>{" "}
          if you suspect unauthorized access to your account.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          4. Subscription Billing &amp; Auto-Renewal
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Paid plans are billed in advance on a recurring basis — monthly or annually, depending on
          the billing cycle you choose — through our third-party payment processor. Subscriptions
          renew automatically at the end of each billing period unless you cancel before the
          renewal date. Prices, plan tiers, and included products are set out on our{" "}
          <Link href="/pricing" className="text-purple-600 hover:underline">
            Pricing page
          </Link>
          , which is incorporated into these Terms by reference and may change with notice. You
          authorize us to charge your payment method on file for all applicable fees, including
          upgrades, overage on usage-based features (such as the shared AI credit pool), and
          renewals. Refunds and cancellations are handled as described in our{" "}
          <Link href="/refund-policy" className="text-purple-600 hover:underline">
            Refund Policy
          </Link>
          .
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          5. License Grant &amp; Restrictions for WordPress Plugins
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Subject to your active subscription and these Terms, {site.name} grants you a limited,
          non-exclusive, non-transferable, revocable license to install and activate each licensed
          plugin on the number of websites permitted by your plan. Licenses are enforced through
          Licenseistic on a per-domain activation basis: each license key can be active on a
          limited number of domains at a time, and you can deactivate a domain yourself from the
          dashboard to free up an activation slot for a different site. This license does not
          transfer ownership of the plugin code to you — see our separate{" "}
          <Link href="/license-agreement" className="text-purple-600 hover:underline">
            Software License Agreement
          </Link>{" "}
          for the complete terms governing use of the licensed software itself, which apply in
          addition to these Terms.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          6. Acceptable Use Policy
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">You agree not to use the Services to:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-ink-600 mb-4">
          <li>Violate any applicable law or regulation, or infringe the rights of any third party</li>
          <li>Send spam, unsolicited messages, or use Chatbotistic's WhatsApp integration in a way that violates the WhatsApp Business Platform's policies</li>
          <li>Upload or transmit malware, or attempt to gain unauthorized access to any system, account, or network</li>
          <li>Reverse engineer, decompile, or attempt to extract the source code of any product except as permitted by law</li>
          <li>Circumvent license activation limits, usage limits, or any technical restriction built into the Services</li>
          <li>Resell, sublicense, or redistribute the Services to third parties outside the terms of your plan</li>
          <li>Use the Services to build a directly competing product</li>
        </ul>
        <p className="text-ink-600 leading-relaxed mb-4">
          We reserve the right to suspend or terminate accounts that violate this policy, with or
          without notice depending on the severity of the violation.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          7. Intellectual Property
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          {site.name} and its licensors retain all right, title, and interest in and to the
          Services, including all software, branding, and documentation, other than the limited
          rights expressly granted to you. You retain ownership of the content, data, and materials
          you upload or generate through the Services — such as your CRM records, chatbot training
          content, and bookings — subject to the license you grant us to host and process that
          content in order to provide the Services to you.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          8. Third-Party Services
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Certain products depend on third-party platforms outside our control. Chatbotistic's
          WhatsApp integration relies on the WhatsApp Business API, and is subject to WhatsApp's own
          terms and policies, which may change independently of us. Subscription billing is
          processed by a third-party payment processor subject to its own terms. Your use of any
          integrated third-party service is governed by that provider's terms in addition to these
          Terms, and we are not responsible for the availability, performance, or policies of
          third-party platforms we integrate with.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          9. Disclaimers
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND,
          WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WITHOUT LIMITATION ANY WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, OR NON-INFRINGEMENT. We do not
          warrant that the Services will be uninterrupted, error-free, or that AI-generated content
          from Chatbotistic, SEOistic, or Postistic will always be accurate — outputs from AI
          features should be reviewed before being relied upon in customer-facing or business-critical
          contexts.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          10. Limitation of Liability
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, {site.name.toUpperCase()} AND ITS OFFICERS,
          EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
          CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL,
          ARISING FROM YOUR USE OF THE SERVICES. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR
          RELATING TO THESE TERMS OR THE SERVICES WILL NOT EXCEED THE AMOUNT YOU PAID US IN THE
          TWELVE MONTHS PRECEDING THE CLAIM. Some jurisdictions do not allow the exclusion or
          limitation of certain damages, so some of the above limitations may not apply to you.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          11. Termination
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          You may cancel your subscription at any time from the dashboard. We may suspend or
          terminate your account if you breach these Terms, fail to pay applicable fees, or if
          required to comply with law. Upon termination, your right to use the Services ends
          immediately, though we handle data retention on cancellation as described in our{" "}
          <Link href="/privacy" className="text-purple-600 hover:underline">
            Privacy Policy
          </Link>
          . Sections of these Terms that by their nature should survive termination — including
          intellectual property, disclaimers, limitation of liability, and governing law — will
          survive.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          12. Governing Law
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          These Terms are governed by the laws of the jurisdiction in which {site.name} is
          incorporated, without regard to its conflict-of-laws principles. Any dispute arising out
          of or relating to these Terms or the Services will be subject to the exclusive
          jurisdiction of the courts located in that jurisdiction, except where applicable consumer
          protection law requires otherwise.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          13. Changes to These Terms
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          We may modify these Terms from time to time. We'll notify you of material changes by
          email or through the dashboard before they take effect. Continuing to use the Services
          after a change takes effect means you accept the updated Terms.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          14. Contact Us
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Questions about these Terms can be sent to{" "}
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
