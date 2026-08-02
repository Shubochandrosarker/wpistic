// Canonical WPistic product catalogue. Mirrors the real catalogue served by
// wpistic-core's ProductsController (wpistic/v1/products) — same ids, names,
// categories, taglines, and statuses — extended with the marketing copy that
// endpoint doesn't carry (description, feature list, pricing, icon).

export type ProductStatus = "Live" | "Beta" | "Coming Soon";
export type ProductCategory =
  | "AI & Automation"
  | "Business Tools"
  | "Analytics"
  | "WordPress Plugins";

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  tagline: string;
  description: string;
  status: ProductStatus;
  flagship?: boolean;
  icon: string;
  features: string[];
  startingPrice: number | null;
  integrations: string[];
}

export const products: Product[] = [
  {
    id: "chatbotistic",
    name: "Chatbotistic",
    category: "AI & Automation",
    tagline: "AI WhatsApp + website chatbot",
    description:
      "One AI agent that answers on your website widget and your business WhatsApp number, trained on your own pages, docs, and product catalogue. It qualifies leads, answers support questions, and hands off to a human the moment a conversation needs one.",
    status: "Live",
    flagship: true,
    icon: "chat",
    features: [
      "Trained automatically on your site content and uploaded docs",
      "Native WhatsApp Business API connection, no third-party bridge",
      "Live handoff to your team with full conversation context",
      "Multilingual replies detected per visitor, no manual setup",
    ],
    startingPrice: 19,
    integrations: ["Memberistic", "CRMistic", "Insightistic"],
  },
  {
    id: "memberistic",
    name: "Memberistic",
    category: "Business Tools",
    tagline: "Memberships & subscriptions",
    description:
      "Recurring memberships and subscription tiers for WordPress, without wiring together three plugins to get there. Gate content, run trials and dunning, and let every other WPistic product read plan and billing status directly.",
    status: "Live",
    icon: "users",
    features: [
      "Tiered membership plans with content and download gating",
      "Built-in trials, coupons, and failed-payment dunning",
      "Emits the plan events Licenseistic and the dashboard already listen for",
      "Member-only pricing tables and account pages out of the box",
    ],
    startingPrice: 15,
    integrations: ["Licenseistic", "Bookingistic", "CRMistic"],
  },
  {
    id: "bookingistic",
    name: "Bookingistic",
    category: "Business Tools",
    tagline: "Booking & appointments",
    description:
      "Appointment and resource booking with real-time availability, buffers, and reminders — built for service businesses running on WordPress instead of a bolted-on scheduling SaaS.",
    status: "Live",
    icon: "calendar",
    features: [
      "Staff, resource, and location calendars with shared availability rules",
      "Automated email/SMS reminders and no-show follow-ups",
      "Deposit and full-payment checkout on the booking flow itself",
      "Syncs two-way with Google Calendar and Outlook",
    ],
    startingPrice: 15,
    integrations: ["Memberistic", "CRMistic"],
  },
  {
    id: "insightistic",
    name: "Insightistic",
    category: "Analytics",
    tagline: "Unified analytics dashboard",
    description:
      "One analytics view across traffic, revenue, and AI usage for every site and product you run — instead of a separate dashboard per plugin. Built to be the 'Analytics' tab inside the WPistic customer dashboard.",
    status: "Live",
    icon: "chart",
    features: [
      "Cross-site traffic, conversion, and revenue rollups",
      "Per-product usage breakdowns (chat sessions, bookings, licenses issued)",
      "Weekly digest email with the metrics that moved",
      "No sampling — every event is stored at full resolution for 13 months",
    ],
    startingPrice: 25,
    integrations: ["Chatbotistic", "Memberistic", "Bookingistic"],
  },
  {
    id: "seoistic",
    name: "SEOistic",
    category: "AI & Automation",
    tagline: "SEO audits & optimization",
    description:
      "Technical SEO audits, content recommendations, and optimization workflows for WordPress teams that want a clear prioritized path from crawl findings to measurable improvements.",
    status: "Live",
    icon: "search",
    features: [
      "Technical crawl and indexability checks",
      "Prioritized on-page and schema recommendations",
      "Content briefs grounded in search intent",
      "Approval workflow before site changes are published",
    ],
    startingPrice: 19,
    integrations: ["Postistic", "Insightistic", "CRMistic"],
  },
  {
    id: "postistic",
    name: "Postistic",
    category: "AI & Automation",
    tagline: "AI content & social automation",
    description:
      "Draft, schedule, and cross-post content from inside WordPress — blog posts, social captions, and image variants generated from a single brief and your existing brand voice.",
    status: "Live",
    icon: "sparkle",
    features: [
      "One brief becomes a blog post plus platform-sized social variants",
      "Scheduling and queue management for every connected channel",
      "Learns your brand voice from past posts, not a generic template",
      "Approval workflow before anything goes live",
    ],
    startingPrice: 19,
    integrations: ["SEOistic", "Insightistic"],
  },
  {
    id: "crmistic",
    name: "CRMistic",
    category: "Business Tools",
    tagline: "CRM for WordPress businesses",
    description:
      "Contacts, deals, and timelines that live where your site already runs — pulling activity from Chatbotistic conversations, Bookingistic appointments, and Memberistic subscriptions into one record per customer.",
    status: "Live",
    icon: "crm",
    features: [
      "Unified contact timeline across chat, bookings, and membership events",
      "Pipeline and deal stages with simple automation rules",
      "Segments you can message directly from the dashboard",
      "No per-contact pricing — priced by workspace, not by list size",
    ],
    startingPrice: 25,
    integrations: ["Chatbotistic", "Bookingistic", "Memberistic"],
  },
  {
    id: "licenseistic",
    name: "Licenseistic",
    category: "WordPress Plugins",
    tagline: "Plugin license manager",
    description:
      "License key issuance, activation limits, and update delivery for your own WordPress plugins and themes — the same engine that manages entitlements across the WPistic product suite itself.",
    status: "Live",
    icon: "key",
    features: [
      "Per-domain activation limits with self-service deactivation",
      "Automatic update delivery gated by a valid license",
      "Reacts to Memberistic plan changes to grant, suspend, or revoke access",
      "REST API for issuing and validating licenses from your own systems",
    ],
    startingPrice: 15,
    integrations: ["Memberistic", "WPistic Core"],
  },
  {
    id: "ffl-checkout",
    name: "FFL Checkout",
    category: "Business Tools",
    tagline: "Compliance-held FFL checkout",
    description:
      "A future FFL transfer checkout workflow. This product remains compliance-held and is not available for claims, checkout, downloads, or paid activation until separate qualified legal and compliance approval.",
    status: "Coming Soon",
    icon: "shield",
    features: [
      "Compliance review required before launch",
      "No customer checkout or product claims are enabled",
      "Separate legal and operational approval gate",
      "Status remains visible as Coming Soon",
    ],
    startingPrice: null,
    integrations: ["CRMistic"],
  },
  {
    id: "formistic",
    name: "Formistic",
    category: "WordPress Plugins",
    tagline: "Forms & workflow automation",
    description:
      "Reliable WordPress forms with validation, routing, notifications, and structured submissions that move cleanly into the rest of your WPistic workspace.",
    status: "Live",
    icon: "form",
    features: [
      "Accessible form builder and validation",
      "Structured submissions and workflow routing",
      "Email notifications with delivery records",
      "CRMistic and dashboard ingestion hooks",
    ],
    startingPrice: 12,
    integrations: ["CRMistic", "Mailistic"],
  },
  {
    id: "verifyistic",
    name: "Verifyistic",
    category: "Business Tools",
    tagline: "KYC & compliance toolkit",
    description:
      "Identity verification and compliance document collection for regulated WordPress businesses — age verification, KYC document upload and review, and an audit trail for every check.",
    status: "Coming Soon",
    icon: "check-shield",
    features: [
      "Document upload with manual or automated review",
      "Age and identity verification gates on checkout or registration",
      "Full audit trail of every check performed",
      "Configurable rules per region",
    ],
    startingPrice: null,
    integrations: ["Memberistic", "CRMistic"],
  },
  {
    id: "messageistic",
    name: "Messageistic",
    category: "Business Tools",
    tagline: "Transactional messaging hub",
    description:
      "Centralize product notifications, customer messages, and delivery status so every workflow speaks with one consistent voice.",
    status: "Live",
    icon: "message",
    features: [
      "Reusable transactional message templates",
      "Delivery and bounce visibility",
      "Event-driven notifications across products",
      "Workspace-level sender and preference controls",
    ],
    startingPrice: 12,
    integrations: ["Formistic", "Mailistic", "CRMistic"],
  },
  {
    id: "scheduleistic",
    name: "Scheduleistic",
    category: "Business Tools",
    tagline: "Schedules & workflow runs",
    description:
      "Plan recurring jobs, reminders, and operational workflows with visible ownership, retries, and run history.",
    status: "Live",
    icon: "clock",
    features: [
      "Recurring schedules with timezone support",
      "Retryable workflow execution",
      "Run history and failure visibility",
      "Hooks for Bookingistic and Messageistic events",
    ],
    startingPrice: 15,
    integrations: ["Bookingistic", "Messageistic", "Postistic"],
  },
  {
    id: "mailistic",
    name: "Mailistic",
    category: "Business Tools",
    tagline: "Email campaigns & delivery",
    description:
      "Build practical email journeys around the customer and product events already flowing through your WPistic workspace.",
    status: "Live",
    icon: "mail",
    features: [
      "Campaign and lifecycle email sequences",
      "Audience segments from workspace events",
      "Template previews and approval workflows",
      "Delivery metrics connected to Messageistic",
    ],
    startingPrice: 15,
    integrations: ["CRMistic", "Messageistic", "Formistic"],
  },
  {
    id: "wpistic-ai-bridge",
    name: "WPistic AI Bridge",
    category: "AI & Automation",
    tagline: "AI provider and product bridge",
    description:
      "A controlled bridge for connecting approved AI capabilities to WPistic products with shared credits, policy checks, and usage visibility.",
    status: "Live",
    icon: "sparkle",
    features: [
      "Provider configuration without product-specific keys",
      "Shared usage and credit accounting",
      "Policy-aware request routing",
      "Audit records for AI-assisted workflows",
    ],
    startingPrice: 19,
    integrations: ["Chatbotistic", "Postistic", "SEOistic"],
  },
];

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export const productCategories: ProductCategory[] = [
  "AI & Automation",
  "Business Tools",
  "Analytics",
  "WordPress Plugins",
];
