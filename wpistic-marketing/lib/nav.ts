export interface NavLink {
  label: string;
  href: string;
  description?: string;
}

export const primaryNav: NavLink[] = [
  { label: "Products", href: "/products" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Solutions", href: "/solutions" },
  { label: "Pricing", href: "/pricing" },
  { label: "Customers", href: "/customers" },
];

export const footerNav: { title: string; links: NavLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "All products", href: "/products" },
      { label: "Marketplace", href: "/marketplace" },
      { label: "Bundles", href: "/bundles" },
      { label: "Pricing", href: "/pricing" },
      { label: "Roadmap", href: "/roadmap" },
      { label: "Status", href: "/status" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Agencies", href: "/solutions#agencies" },
      { label: "Freelancers", href: "/solutions#freelancers" },
      { label: "WooCommerce stores", href: "/solutions#woocommerce" },
      { label: "SaaS founders", href: "/solutions#saas" },
      { label: "Enterprise", href: "/solutions#enterprise" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Developers", href: "/developers" },
      { label: "Downloads", href: "/downloads" },
      { label: "Blog", href: "/blog" },
      { label: "Support", href: "/support" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Customers", href: "/customers" },
      { label: "Affiliate program", href: "/affiliate" },
      { label: "Partners", href: "/partners" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

export const legalNav: NavLink[] = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Security", href: "/security" },
  { label: "Cookie policy", href: "/cookie-policy" },
  { label: "Refund policy", href: "/refund-policy" },
  { label: "License agreement", href: "/license-agreement" },
];
