import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How WPistic collects, uses, and protects the data behind your account, your websites, and the products you run — including Chatbotistic conversations and Insightistic analytics.",
};

const LAST_UPDATED = "June 1, 2026";

export default function PrivacyPolicyPage() {
  return (
    <Section className="pt-16 pb-20 sm:pt-24">
      <Container className="max-w-3xl">
        <Eyebrow>Legal</Eyebrow>
        <h1 className="font-display mt-4 text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-ink-500">Last updated: {LAST_UPDATED}</p>

        <p className="mt-8 text-ink-600 leading-relaxed mb-4">
          This Privacy Policy explains how {site.name} ("{site.name}", "we", "us", or "our")
          collects, uses, shares, and protects information when you visit {site.domain}, create an
          account, or use any product in the {site.name} suite — including Chatbotistic,
          Memberistic, Bookingistic, Insightistic, CRMistic, Licenseistic, and the rest of the
          products available through the {site.name} dashboard (collectively, the "Services"). By
          using the Services, you agree to the collection and use of information as described
          here.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          1. Information We Collect
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          We collect information in a few different ways, depending on how you use the Services:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-ink-600 mb-4">
          <li>
            <span className="font-semibold text-ink-800">Account and contact information.</span>{" "}
            Your name, email address, company name, and password (stored as a salted hash, never
            in plain text) when you register for the dashboard.
          </li>
          <li>
            <span className="font-semibold text-ink-800">Billing information.</span> When you
            subscribe to a paid plan, our payment processor collects your card or payment details
            directly. {site.name} does not store full card numbers on its own servers — we retain
            only the billing metadata needed to reconcile invoices, such as plan, amount, and
            payment status.
          </li>
          <li>
            <span className="font-semibold text-ink-800">Product usage data.</span> Log-level and
            aggregate data about how you and your team use the dashboard and each product — pages
            visited, features used, license activations, and API calls.
          </li>
          <li>
            <span className="font-semibold text-ink-800">Chatbot conversation content.</span> If
            you use Chatbotistic, the messages exchanged between your site's visitors and the AI
            agent (and, where enabled, the connected WhatsApp Business number) are processed and
            stored so the conversation history, handoff context, and training data work as
            intended. This content is controlled by you as the site owner; visitors interacting
            with your chatbot are your customers, and you are responsible for your own disclosures
            to them.
          </li>
          <li>
            <span className="font-semibold text-ink-800">Website analytics.</span> If you use
            Insightistic on a connected site, we collect traffic, conversion, and usage events
            (such as page views, referrers, and device type) to power the analytics dashboard.
          </li>
          <li>
            <span className="font-semibold text-ink-800">Support communications.</span> Anything
            you send us when you contact support, report a bug, or request a feature.
          </li>
        </ul>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          2. How We Use Your Information
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">We use the information we collect to:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-ink-600 mb-4">
          <li>Provide, operate, and maintain the Services, including your dashboard, licenses, and each product you activate</li>
          <li>Process subscription billing, send invoices, and manage renewals and upgrades</li>
          <li>Power product functionality that depends on your data, such as Chatbotistic's replies, CRMistic's contact timeline, and Insightistic's dashboards</li>
          <li>Respond to support requests and communicate service-related notices</li>
          <li>Detect, investigate, and prevent fraud, abuse, and security incidents</li>
          <li>Improve the Services, including diagnosing bugs and understanding aggregate usage patterns</li>
          <li>Send product updates and marketing communications, where you haven't opted out</li>
        </ul>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          3. Legal Bases for Processing
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Where applicable data protection law requires a legal basis (such as under the GDPR), we
          rely on one or more of the following: performance of a contract with you (delivering the
          Services you've subscribed to), our legitimate interests (such as securing the Services
          and improving product quality), your consent (for example, for certain cookies or
          marketing emails), and compliance with legal obligations we're subject to, such as tax
          and accounting requirements.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          4. Cookies and Tracking Technologies
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          {site.name} and the products in our suite use cookies and similar technologies for
          authentication, session management, preferences, and analytics. For a full breakdown of
          the categories of cookies we use and how to manage them, see our{" "}
          <Link href="/cookie-policy" className="text-purple-600 hover:underline">
            Cookie Policy
          </Link>
          .
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          5. How We Share Your Information
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          We do not sell your personal information. We share data only with the service providers
          and partners necessary to run the Services, under contractual obligations that limit
          their use of your data to the purpose we've engaged them for:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-ink-600 mb-4">
          <li>
            <span className="font-semibold text-ink-800">Payment processing.</span> A
            PCI-compliant third-party payment processor handles card data and subscription billing
            on our behalf.
          </li>
          <li>
            <span className="font-semibold text-ink-800">Hosting and infrastructure.</span> Cloud
            hosting, database, email delivery, and content-delivery providers that store or
            transmit data as part of running the dashboard and each product.
          </li>
          <li>
            <span className="font-semibold text-ink-800">Messaging channels.</span> Where you
            connect Chatbotistic to a WhatsApp Business number, message delivery relies on the
            WhatsApp Business Platform, which processes the messages in transit.
          </li>
          <li>
            <span className="font-semibold text-ink-800">Legal and safety.</span> Where required to
            comply with law, enforce our agreements, or protect the rights, property, or safety of
            {" " + site.name}, our customers, or others.
          </li>
          <li>
            <span className="font-semibold text-ink-800">Business transfers.</span> In connection
            with a merger, acquisition, financing, or sale of assets, subject to the confidentiality
            obligations described in this policy carrying over to the new owner.
          </li>
        </ul>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          6. Data Retention
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          We retain account and billing data for as long as your account is active and as needed
          to meet legal, tax, and accounting obligations after that. Analytics event data collected
          through Insightistic is stored at full resolution for a rolling 13-month window before
          being aggregated or deleted. Chatbotistic conversation history is retained for as long as
          your account and the associated site connection remain active, or until you delete it
          from the dashboard. If you cancel a subscription, your data is not deleted outright —
          affected products move into a read-only state rather than being erased, so you can
          reconnect and restore access if you resubscribe.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          7. Your Rights and Choices
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Depending on where you live, you may have rights over your personal information similar
          to those recognized under the GDPR (for users in the EU/EEA and UK) or the CCPA and other
          US state privacy laws (for California and other US residents). These typically include
          the right to access the personal data we hold about you, request a copy in a portable
          format, request correction of inaccurate data, request deletion, object to or restrict
          certain processing, and withdraw consent where processing is based on consent. You can
          exercise most of these directly from your account settings in the dashboard, or by
          emailing us at{" "}
          <a href={`mailto:${site.supportEmail}`} className="text-purple-600 hover:underline">
            {site.supportEmail}
          </a>
          . We'll verify your request and respond within the timeframe required by applicable law.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          8. Children's Privacy
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          The Services are intended for businesses and individuals aged 18 and older. We do not
          knowingly collect personal information from children under 16. If you believe a child has
          provided us with personal information, contact us and we will take steps to delete it.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          9. International Data Transfers
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          {site.name}'s infrastructure and service providers may process data in countries other
          than the one you're located in. Where we transfer personal data internationally, we rely
          on appropriate safeguards recognized under applicable law, such as standard contractual
          clauses, to ensure your data continues to receive an adequate level of protection.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          10. Data Security
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          We use technical and organizational measures — including encryption in transit and at
          rest, access controls, and regular patching — to protect the data we hold. No system is
          perfectly secure, so we also depend on you to use a strong password and keep your account
          credentials confidential. For a detailed look at our security practices, see our{" "}
          <Link href="/security" className="text-purple-600 hover:underline">
            Security page
          </Link>
          .
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          11. Changes to This Policy
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          We may update this Privacy Policy from time to time to reflect changes in our practices
          or for legal, operational, or regulatory reasons. If we make material changes, we'll
          notify you by email or through the dashboard before the changes take effect. The "Last
          updated" date at the top of this page reflects when it was last revised.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          12. Contact Us
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          If you have questions about this Privacy Policy or how we handle your data, email us at{" "}
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
