import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Software License Agreement",
  description:
    "The end-user license agreement governing the WordPress plugins in the WPistic suite — activation limits, permitted use, updates, and license verification.",
};

const LAST_UPDATED = "June 1, 2026";

export default function LicenseAgreementPage() {
  return (
    <Section className="pt-16 pb-20 sm:pt-24">
      <Container className="max-w-3xl">
        <Eyebrow>Legal</Eyebrow>
        <h1 className="font-display mt-4 text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl">
          Software License Agreement
        </h1>
        <p className="mt-3 text-sm text-ink-500">Last updated: {LAST_UPDATED}</p>

        <p className="mt-8 text-ink-600 leading-relaxed mb-4">
          This Software License Agreement ("License Agreement") governs your use of the WordPress
          plugins and themes distributed by {site.name} (each, the "Licensed Software"), including
          plugins for Chatbotistic, Memberistic, Bookingistic, Insightistic, CRMistic, and any other
          {" "}{site.name} product distributed as installable WordPress code. It applies in addition
          to, and does not replace, our general{" "}
          <Link href="/terms" className="text-purple-600 hover:underline">
            Terms of Service
          </Link>
          . If there's a conflict between the two specifically regarding the licensed plugin code,
          this License Agreement controls.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          1. Grant of License
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Subject to an active, paid subscription and compliance with this License Agreement,
          {" "}{site.name} grants you a limited, non-exclusive, non-transferable license to install
          and activate the Licensed Software on the number of website domains permitted by your
          plan. Licenses are managed through Licenseistic on a per-domain activation basis: each
          license key can be active on a fixed number of domains at a time, tracked by the domain
          the plugin is running on. If you need to move a license to a different site, you can
          deactivate it from the affected domain yourself in the dashboard, which immediately frees
          up that activation slot for use elsewhere.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          2. Permitted Use
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          You may install, activate, configure, and use the Licensed Software on websites you own
          or manage, up to the activation limit of your plan. Agencies and freelancers may install
          the Licensed Software on client websites as part of providing services to those clients,
          provided the underlying subscription and license remain in your control and in good
          standing.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          3. Restrictions
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">You may not:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-ink-600 mb-4">
          <li>Redistribute, resell, sublicense, rent, or lease the Licensed Software's code to any third party, whether modified or unmodified</li>
          <li>Remove, disable, obscure, or attempt to circumvent any license validation, activation limit, or entitlement check built into the Licensed Software</li>
          <li>Reverse engineer, decompile, or disassemble the Licensed Software except to the extent expressly permitted by applicable law notwithstanding this restriction</li>
          <li>Use the Licensed Software beyond the activation limit of your plan, or share a single license key across more domains than your plan permits</li>
          <li>Represent the Licensed Software, in whole or in part, as your own original work</li>
        </ul>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          4. Updates &amp; Support Entitlement
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          While your license is active and in good standing, you're entitled to automatic delivery
          of updates to the Licensed Software, including bug fixes, security patches, and new
          features, along with the support level included in your plan. Update delivery is gated by
          license validity — if your subscription lapses, the plugin will stop receiving new
          updates until the license is reactivated, though it will continue running its current,
          already-installed version until you take further action.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          5. License Verification
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          To enforce activation limits and gate updates, the Licensed Software periodically
          communicates with {site.name}'s licensing servers to verify that its license key is valid,
          active, and within its permitted number of activations for that domain — a routine
          "phone-home" check. This check transmits the license key and the site's domain; it does
          not transmit the content of your website. If the license cannot be verified as valid —
          for example, because the subscription has lapsed or the activation limit has been
          exceeded — plugin functionality that depends on an active license (such as update
          delivery and certain premium features) may be restricted until the license is restored.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          6. Term &amp; Termination
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          This License Agreement remains in effect for as long as you have an active subscription
          covering the Licensed Software. Your license terminates automatically if your
          subscription payment fails and is not resolved within the grace period described at
          checkout or in your account settings, or if you violate the restrictions in Section 3. We
          may also terminate a license immediately if required to comply with law or to prevent harm
          to {site.name} or other customers. Upon termination, your right to receive updates and
          license-gated functionality ends, though this does not, by itself, delete your website
          data — see our{" "}
          <Link href="/refund-policy" className="text-purple-600 hover:underline">
            Refund Policy
          </Link>{" "}
          for how account data is handled on cancellation.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          7. Ownership &amp; Intellectual Property
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          The Licensed Software is licensed, not sold. {site.name} and its licensors retain all
          right, title, and interest in and to the Licensed Software, including all source code,
          object code, design, and documentation, along with any updates or modifications we make
          to it. Nothing in this License Agreement transfers ownership of the Licensed Software to
          you. Where a Licensed Software component incorporates open-source code, that component
          remains subject to its own applicable open-source license, to the extent required.
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          8. Disclaimer of Warranty
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          THE LICENSED SOFTWARE IS PROVIDED "AS IS," WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
          IMPLIED, INCLUDING WITHOUT LIMITATION ANY WARRANTY OF MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, OR NON-INFRINGEMENT. We don't warrant that the Licensed Software will
          be compatible with every WordPress theme, plugin combination, or hosting environment, or
          that it will operate uninterrupted or error-free. Liability arising from use of the
          Licensed Software is further limited as described in our{" "}
          <Link href="/terms" className="text-purple-600 hover:underline">
            Terms of Service
          </Link>
          .
        </p>

        <h2 className="font-display text-xl font-bold text-ink-900 mt-10 mb-3">
          9. Contact Us
        </h2>
        <p className="text-ink-600 leading-relaxed mb-4">
          Questions about this License Agreement can be sent to{" "}
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
