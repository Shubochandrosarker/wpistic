import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProductGlyph } from "@/components/ui/ProductGlyph";
import { products } from "@/lib/products";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Downloads",
  description:
    "Download and install any WPistic product on your WordPress site — requires an active license on your WPistic account.",
};

const STATUS_TONE = { Live: "green", Beta: "purple", "Coming Soon": "gray" } as const;

export default function DownloadsPage() {
  return (
    <>
      <Section className="pt-16 pb-12 sm:pt-24">
        <Container>
          <SectionHeading
            eyebrow="Downloads"
            title="Every WPistic product, ready to install"
            description="WPistic products are licensed WordPress plugins, not free downloads — installing one requires an active WPistic account. Sign into your dashboard to grab the plugin zip and your license key at the same time."
          />
          <p className="mt-4 text-[14.5px] text-ink-500">
            Don&apos;t have an account yet?{" "}
            <a href="/register" className="font-semibold text-purple-600 hover:text-purple-700">
              See products and start free
            </a>
            .
          </p>
        </Container>
      </Section>

      <Section className="bg-ink-50 pt-8">
        <Container>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Card key={product.id} className="flex flex-col">
                <div className="flex items-start gap-3.5">
                  <ProductGlyph category={product.category} icon={product.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[15.5px] font-bold text-ink-900">{product.name}</span>
                      {product.flagship && <Badge tone="purple">Flagship</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-400">{product.category}</div>
                  </div>
                  <Badge tone={STATUS_TONE[product.status]} dot>
                    {product.status}
                  </Badge>
                </div>
                <p className="mt-3.5 flex-1 text-[13.5px] leading-relaxed text-ink-600">
                  {product.tagline}
                </p>
                <div className="mt-4 border-t border-ink-100 pt-4">
                  {product.status === "Coming Soon" ? (
                    <Button href="/contact" variant="outline" className="w-full">
                      Join waitlist
                    </Button>
                  ) : (
                    <Button href={site.dashboardUrl} external variant="green" className="w-full" icon="download">
                      Download in dashboard
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="text-center">
          <h2 className="font-display mx-auto max-w-xl text-3xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-4xl">
            Need free access before you can download?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-lg text-ink-600">
            Start with card-free access to a free product, so you can install and try a
            product before you commit.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/register" variant="green" size="lg" icon="arrow">
              Start free
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
