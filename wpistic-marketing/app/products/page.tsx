import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { products, productCategories } from "@/lib/products";
import { ProductsExplorer } from "./ProductsExplorer";

export const metadata: Metadata = {
  title: "Products",
  description:
    "Browse the full WPistic product suite — AI chat, CRM, bookings, memberships, analytics, licensing, and more, all built to work together.",
};

export default function ProductsPage() {
  return (
    <Section className="pt-16 sm:pt-24">
      <Container>
        <SectionHeading
          eyebrow="Product suite"
          title="Eleven products, built to run together"
          description="Every product below installs like a normal WordPress plugin and reports into the same WPistic dashboard — licenses, billing, and usage in one place."
        />
        <div className="mt-12">
          <ProductsExplorer products={products} categories={productCategories} />
        </div>
      </Container>
    </Section>
  );
}
