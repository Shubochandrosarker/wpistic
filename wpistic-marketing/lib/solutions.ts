export interface Solution {
  id: string;
  audience: string;
  headline: string;
  summary: string;
  painPoints: string[];
  recommendedProducts: string[]; // product ids
}

export const solutions: Solution[] = [
  {
    id: "agencies",
    audience: "Agencies",
    headline: "Run every client site on one stack, not twelve plugins",
    summary:
      "Agencies standardize a client's stack on WPistic once instead of re-evaluating chat, CRM, and booking plugins on every new build. One dashboard, one support line, one invoice for every product across every client.",
    painPoints: [
      "Different plugin choices on every client site make handoffs and audits slow",
      "Client billing for third-party SaaS tools is hard to pass through cleanly",
      "No single place to see what's active across a whole client portfolio",
    ],
    recommendedProducts: ["crmistic", "chatbotistic", "insightistic", "licenseistic"],
  },
  {
    id: "freelancers",
    audience: "Freelancers",
    headline: "Ship client sites with a CRM and chatbot already wired in",
    summary:
      "Freelancers building WordPress sites for small businesses can bundle a working CRM, booking flow, and AI chatbot into a build instead of stitching together three separate SaaS trials for every client.",
    painPoints: [
      "Clients expect chat, booking, and a CRM but the budget is one plugin bundle, not four subscriptions",
      "Every new client means re-learning a different scheduling or CRM plugin",
    ],
    recommendedProducts: ["bookingistic", "chatbotistic", "crmistic"],
  },
  {
    id: "woocommerce",
    audience: "WooCommerce stores",
    headline: "Add support, memberships, and CRM around your existing store",
    summary:
      "WPistic is not a WooCommerce replacement — it's the layer around it. Keep your store exactly as it is and add AI support chat, a customer CRM, and paid membership tiers without touching checkout.",
    painPoints: [
      "Support tickets pile up with no AI triage layer in front of them",
      "No unified view of a customer across orders, support chats, and membership status",
    ],
    recommendedProducts: ["chatbotistic", "memberistic", "crmistic"],
  },
  {
    id: "saas",
    audience: "SaaS founders",
    headline: "Launch on WordPress without building your own billing engine",
    summary:
      "Memberistic and Licenseistic give a WordPress-based SaaS product real subscription billing, entitlements, and license enforcement — the unglamorous infrastructure every SaaS needs before it needs anything else.",
    painPoints: [
      "Building subscription billing and license enforcement from scratch is months of work before you ship a single feature",
      "Off-the-shelf membership plugins don't expose the webhooks and events a real product needs",
    ],
    recommendedProducts: ["memberistic", "licenseistic", "insightistic"],
  },
  {
    id: "marketers",
    audience: "Digital marketers & SEO agencies",
    headline: "Automate content and see the traffic impact in one place",
    summary:
      "Postistic drafts and schedules content across channels from a single brief; Insightistic shows what that content actually did to traffic and conversion — without exporting CSVs between four different tools.",
    painPoints: [
      "Content production and analytics live in separate tools with no shared view",
      "Reporting to clients means manually assembling numbers from several dashboards",
    ],
    recommendedProducts: ["postistic", "insightistic", "wpagentistic"],
  },
  {
    id: "enterprise",
    audience: "Enterprise",
    headline: "Procurement-ready contracts, SSO, and dedicated support",
    summary:
      "Larger organizations get custom contracts, SSO, audit logging, and a named support contact — the same product suite, with the account structure procurement teams expect.",
    painPoints: [
      "Per-seat SaaS pricing doesn't fit an organization managing dozens of WordPress properties",
      "Security review requires SSO and audit logs most WordPress plugins don't offer",
    ],
    recommendedProducts: ["insightistic", "crmistic", "licenseistic"],
  },
];
