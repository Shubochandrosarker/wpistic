import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { ProductCard } from "@/components/ui/ProductCard";
import { solutions } from "@/lib/solutions";
import { getProduct } from "@/lib/products";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "WPistic for however you build on WordPress — tailored recommendations for agencies, freelancers, WooCommerce stores, SaaS founders, marketers, and enterprise.",
};

export default function SolutionsPage() {
  return (
    <>
      <Section className="pt-16 pb-12 sm:pt-24">
        <Container className="max-w-3xl text-center">
          <SectionHeading
            eyebrow="Solutions"
            title="WPistic for however you build on WordPress"
            description="The same fifteen products, recommended differently depending on who's running them — an agency managing client sites needs a different starting point than a solo freelancer or an enterprise IT team."
            align="center"
          />
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {solutions.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-full border border-ink-150 bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-purple-300 hover:text-purple-600"
              >
                {s.audience}
              </a>
            ))}
          </div>
        </Container>
      </Section>

      {solutions.map((solution, i) => {
        const recommended = solution.recommendedProducts
          .map((id) => getProduct(id))
          .filter((p): p is NonNullable<typeof p> => Boolean(p));

        return (
          <Section
            key={solution.id}
            id={solution.id}
            className={i % 2 === 1 ? "bg-ink-50" : undefined}
          >
            <Container>
              <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
                <div>
                  <Eyebrow>{solution.audience}</Eyebrow>
                  <h2 className="font-display mt-4 text-3xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-4xl">
                    {solution.headline}
                  </h2>
                  <p className="mt-4 text-lg leading-relaxed text-ink-600">{solution.summary}</p>

                  <div className="mt-8">
                    <div className="text-xs font-bold tracking-wider text-ink-400 uppercase">
                      The problem
                    </div>
                    <ul className="mt-3 space-y-2.5">
                      {solution.painPoints.map((point) => (
                        <li key={point} className="flex items-start gap-2.5 text-[14.5px] text-ink-700">
                          <Icon name="x" size={15} className="mt-0.5 shrink-0 text-red-500" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold tracking-wider text-ink-400 uppercase">
                    Recommended products
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {recommended.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                </div>
              </div>
            </Container>
          </Section>
        );
      })}

      <Section>
        <Container className="text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
            Not sure which products fit your setup?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-ink-600">
            Talk to us about your stack and we&apos;ll point you at the right starting products — or
            browse the full suite yourself.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button href="/contact" variant="green" size="lg" icon="arrow">
              Talk to us
            </Button>
            <Button href="/products" variant="outline" size="lg">
              Browse all products
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
