import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Section } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { getPost, posts } from "@/lib/blog";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: { title: `${post.title} — ${site.name}`, description: post.excerpt },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const more = posts.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <>
      <Section className="pt-16 pb-12 sm:pt-20">
        <Container className="max-w-3xl">
          <nav className="text-sm text-ink-400">
            <Link href="/blog" className="hover:text-purple-600">
              Blog
            </Link>
            <span className="mx-2">/</span>
            <span className="text-ink-600">{post.title}</span>
          </nav>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Badge tone="purple">{post.category}</Badge>
            <span className="text-sm text-ink-500">{post.date}</span>
            <span className="text-sm text-ink-300">·</span>
            <span className="text-sm text-ink-500">{post.author}</span>
          </div>

          <h1 className="font-display mt-4 text-3xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-4xl">
            {post.title}
          </h1>

          <div className="mt-10 space-y-5">
            {post.content.map((paragraph, i) => (
              <p key={i} className="text-[15.5px] leading-relaxed text-ink-700">
                {paragraph}
              </p>
            ))}
          </div>
        </Container>
      </Section>

      {more.length > 0 && (
        <Section className="bg-ink-50">
          <Container>
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink-900">
              More from the blog
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {more.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="group">
                  <Card hoverable className="flex h-full flex-col">
                    <div className="flex items-center justify-between gap-3">
                      <Badge tone="purple">{p.category}</Badge>
                      <span className="text-xs text-ink-400">{p.date}</span>
                    </div>
                    <h3 className="font-display mt-4 text-base font-bold text-ink-900 group-hover:text-purple-600">
                      {p.title}
                    </h3>
                    <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-ink-600">
                      {p.excerpt}
                    </p>
                    <span className="mt-5 inline-flex items-center gap-1 border-t border-ink-100 pt-4 text-sm font-semibold text-purple-600">
                      Read <Icon name="arrow" size={14} />
                    </span>
                  </Card>
                </Link>
              ))}
            </div>
          </Container>
        </Section>
      )}
    </>
  );
}
