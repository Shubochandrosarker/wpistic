import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Section } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { ProductCard } from "@/components/ui/ProductCard";
import { customerStories } from "@/lib/testimonials";
import { getProduct } from "@/lib/products";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return customerStories.map((s) => ({ slug: s.slug }));
}

function getStory(slug: string) {
  return customerStories.find((s) => s.slug === slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const story = getStory(slug);
  if (!story) return {};
  return {
    title: story.company,
    description: story.summary,
    openGraph: { title: `${story.company} — ${site.name}`, description: story.summary },
  };
}

export default async function CustomerStoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const story = getStory(slug);
  if (!story) notFound();

  const productsUsed = story.productIds
    .map((id) => getProduct(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const reviewJsonLd = {
    "@context": "https://schema.org",
    "@type": "Review",
    reviewBody: story.quote,
    author: { "@type": "Person", name: story.contactName },
    itemReviewed: { "@type": "Organization", name: site.name, url: site.url },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(reviewJsonLd) }}
      />

      <Section className="pt-16 pb-12 sm:pt-20">
        <Container className="max-w-3xl">
          <nav className="text-sm text-ink-400">
            <Link href="/customers" className="hover:text-purple-600">
              Customers
            </Link>
            <span className="mx-2">/</span>
            <span className="text-ink-600">{story.company}</span>
          </nav>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
              {story.company}
            </h1>
            <Badge tone="purple">{story.industry}</Badge>
          </div>

          <Card className="mt-8">
            <Icon name="quote" size={26} className="text-purple-300" />
            <p className="font-display mt-4 text-xl leading-relaxed font-medium text-balance text-ink-900 sm:text-2xl">
              “{story.quote}”
            </p>
            <p className="mt-5 text-sm font-semibold text-ink-500">
              — {story.contactName}, {story.contactRole} at {story.company}
            </p>
          </Card>
        </Container>
      </Section>

      <Section className="bg-ink-50 pt-0">
        <Container>
          <div className="grid grid-cols-1 gap-8 rounded-[2rem] border border-ink-150 bg-white p-10 sm:grid-cols-3 sm:p-14">
            {story.results.map((r) => (
              <Stat key={r.label} value={r.value} label={r.label} />
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-3xl">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink-900">
            The story
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-600">{story.summary}</p>
        </Container>
      </Section>

      <Section className="bg-ink-50">
        <Container>
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink-900">
            Products used
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {productsUsed.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
            Want results like {story.company}?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-ink-600">
            Start free with one product, or talk to us about the products {story.company} uses.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button href="/pricing" variant="green" size="lg" icon="arrow">
              Start free
            </Button>
            <Button href="/customers" variant="outline" size="lg">
              Read more stories
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
