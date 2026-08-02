import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { products } from "@/lib/products";
import { customerStories } from "@/lib/testimonials";
import { posts } from "@/lib/blog";

export const dynamic = "force-static";

const staticRoutes = [
  "",
  "/products",
  "/marketplace",
  "/bundles",
  "/pricing",
  "/solutions",
  "/customers",
  "/developers",
  "/docs",
  "/downloads",
  "/support",
  "/about",
  "/blog",
  "/affiliate",
  "/partners",
  "/roadmap",
  "/status",
  "/security",
  "/contact",
  "/privacy",
  "/terms",
  "/cookie-policy",
  "/refund-policy",
  "/license-agreement",
  "/login",
  "/register",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = staticRoutes.map(
    (path): MetadataRoute.Sitemap[number] => ({
      url: `${site.url}${path}`,
      changeFrequency: path === "" ? "weekly" : "monthly",
      priority: path === "" ? 1 : 0.7,
    }),
  );

  for (const product of products) {
    entries.push({
      url: `${site.url}/products/${product.id}`,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  for (const story of customerStories) {
    entries.push({
      url: `${site.url}/customers/${story.slug}`,
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }

  for (const post of posts) {
    entries.push({
      url: `${site.url}/blog/${post.slug}`,
      changeFrequency: "yearly",
      priority: 0.4,
    });
  }

  return entries;
}
