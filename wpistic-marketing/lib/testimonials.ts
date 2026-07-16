export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  productIds: string[];
}

export const testimonials: Testimonial[] = [
  {
    quote:
      "We replaced a chat widget, a separate CRM, and a spreadsheet of appointment requests with three WPistic products that already talk to each other. Onboarding a new client site now takes an afternoon.",
    name: "Priya Nair",
    role: "Founder",
    company: "Northloop Digital",
    productIds: ["chatbotistic", "crmistic", "bookingistic"],
  },
  {
    quote:
      "Licenseistic runs the entitlements for our own plugin business now — the same engine WPistic uses on itself. We stopped maintaining our own license server the week we switched.",
    name: "Marcus Webb",
    role: "Co-founder",
    company: "Fieldstack Plugins",
    productIds: ["licenseistic", "memberistic"],
  },
  {
    quote:
      "Insightistic is the first analytics tool where our client reports write themselves. One export covers traffic, chat volume, and booking conversion instead of three different logins.",
    name: "Elena Voss",
    role: "Head of Ops",
    company: "Rowhouse Agency",
    productIds: ["insightistic", "chatbotistic", "bookingistic"],
  },
  {
    quote:
      "We priced Chatbotistic against three WhatsApp chatbot SaaS tools before deciding. It was the only one that also updated our CRM automatically. That integration is the whole reason we stayed.",
    name: "Daniel Ochieng",
    role: "Owner",
    company: "Coastline Rentals",
    productIds: ["chatbotistic", "crmistic"],
  },
];

export interface CustomerStory {
  slug: string;
  company: string;
  industry: string;
  summary: string;
  results: { label: string; value: string }[];
  productIds: string[];
  quote: string;
  contactName: string;
  contactRole: string;
}

export const customerStories: CustomerStory[] = [
  {
    slug: "northloop-digital",
    company: "Northloop Digital",
    industry: "Web design agency",
    summary:
      "Northloop standardized every client build on WPistic's chat, CRM, and booking products after years of choosing a different plugin stack per project.",
    results: [
      { label: "Client onboarding time", value: "Down from 2 weeks to 1 afternoon" },
      { label: "Support tickets per client", value: "-38% after Chatbotistic triage" },
      { label: "Products per client site", value: "3, on average" },
    ],
    productIds: ["chatbotistic", "crmistic", "bookingistic"],
    quote:
      "We stopped re-deciding our stack on every project. Clients get the same reliable set of products, and we get one dashboard instead of twelve logins.",
    contactName: "Priya Nair",
    contactRole: "Founder",
  },
  {
    slug: "fieldstack-plugins",
    company: "Fieldstack Plugins",
    industry: "WordPress plugin developer",
    summary:
      "Fieldstack runs its own commercial plugin licensing on top of Licenseistic instead of maintaining a custom license server.",
    results: [
      { label: "License server maintenance", value: "Retired entirely" },
      { label: "Time to issue a new license type", value: "Minutes, via the REST API" },
      { label: "Support load from license issues", value: "-25%" },
    ],
    productIds: ["licenseistic", "memberistic"],
    quote:
      "Licenseistic is infrastructure we didn't want to build ourselves. It's the same system WPistic trusts for its own products.",
    contactName: "Marcus Webb",
    contactRole: "Co-founder",
  },
  {
    slug: "rowhouse-agency",
    company: "Rowhouse Agency",
    industry: "Marketing agency",
    summary:
      "Rowhouse consolidated client reporting into Insightistic after assembling reports from three separate analytics logins for every account.",
    results: [
      { label: "Reporting time per client", value: "-70%" },
      { label: "Dashboards replaced", value: "3 → 1" },
      { label: "Client retention after rollout", value: "+12%" },
    ],
    productIds: ["insightistic", "chatbotistic", "bookingistic"],
    quote:
      "Insightistic is the first analytics tool where our client reports write themselves.",
    contactName: "Elena Voss",
    contactRole: "Head of Ops",
  },
];
