export interface PricingTier {
  id: string;
  name: string;
  monthlyPrice: number | null; // null = "Custom" / contact sales
  annualPrice: number | null; // per-month price when billed annually
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlighted?: boolean;
  badge?: string;
}

export const pricingTiers: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    description: "One product, one site — enough to know if WPistic fits before you pay for it.",
    features: [
      "1 WPistic product, active on 1 website",
      "Community support forum",
      "Core dashboard, licenses, and downloads",
      "WPistic branding on customer-facing widgets",
    ],
    cta: "Start free",
    href: "/products",
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 29,
    annualPrice: 24,
    description: "For a single site that's ready to run 2–3 WPistic products together.",
    features: [
      "Up to 3 products, active on 1 website",
      "Email support, 1 business day response",
      "Remove WPistic branding",
      "Cross-product data (chat → CRM → analytics)",
    ],
    cta: "Coming soon",
    href: "/contact",
  },
  {
    id: "professional",
    name: "Professional",
    monthlyPrice: 79,
    annualPrice: 65,
    description: "The plan most freelancers and small agencies run client sites on.",
    features: [
      "All products, active on up to 3 websites",
      "Priority email + chat support",
      "AI credit pool shared across products",
      "Client-ready white-label branding",
    ],
    cta: "Coming soon",
    href: "/contact",
    highlighted: true,
    badge: "Most popular",
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 199,
    annualPrice: 165,
    description: "For teams running WPistic across a growing portfolio of sites.",
    features: [
      "All products, active on up to 15 websites",
      "Team seats with role-based permissions",
      "Larger AI credit pool with overage billing, not hard caps",
      "Quarterly account review with our team",
    ],
    cta: "Coming soon",
    href: "/contact",
  },
  {
    id: "agency",
    name: "Agency",
    monthlyPrice: 399,
    annualPrice: 330,
    description: "Unlimited sites for agencies reselling or managing WPistic for clients.",
    features: [
      "All products, unlimited websites",
      "Client sub-accounts with billing you control",
      "Reseller pricing on every product",
      "Dedicated Slack channel with our team",
    ],
    cta: "Talk to sales",
    href: "/contact",
  },
  {
    id: "lifetime",
    name: "Lifetime",
    monthlyPrice: null,
    annualPrice: null,
    description: "A single payment for Professional-tier access to every product, forever.",
    features: [
      "All current and future products, 3 websites",
      "All future updates, no renewal",
      "Same priority support as Professional",
      "Limited-time offer while WPistic is in early access",
    ],
    cta: "View lifetime deal",
    href: "/pricing#lifetime",
    badge: "Early access",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: null,
    annualPrice: null,
    description: "Custom contracts, SLAs, and deployment support for larger organizations.",
    features: [
      "Unlimited products and websites",
      "Custom SLA with a named support contact",
      "SSO, audit logs, and procurement-ready contracts",
      "Migration and onboarding support included",
    ],
    cta: "Talk to sales",
    href: "/contact",
  },
];

export const pricingFaqs = [
  {
    q: "Do I need WooCommerce to use WPistic?",
    a: "No. WPistic is built as its own SaaS engine on top of WordPress — WooCommerce is intentionally not part of the stack. Billing, licensing, and entitlements are handled by WPistic's own plugins.",
  },
  {
    q: "What happens to my sites if I downgrade or cancel?",
    a: "Your data is never deleted for billing reasons. If a plan no longer covers a product or a website, that product moves into a read-only, \"reconnect to restore\" state instead of losing configuration or history.",
  },
  {
    q: "Can I mix and match individual products instead of a bundle?",
    a: "Yes — every product also has its own standalone price (see each product page). Bundled plans are usually cheaper once you're running three or more products together.",
  },
  {
    q: "How does the AI credit pool work?",
    a: "Chatbotistic, SEOistic, and Postistic draw from one shared AI credit pool sized to your plan, rather than separate limits per product. Paid plan billing is coming soon.",
  },
  {
    q: "Is there a discount for paying annually?",
    a: "Yes, annual billing is shown alongside monthly pricing on this page and works out to roughly two months free compared to paying monthly.",
  },
];
