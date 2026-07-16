import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { posts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Product announcements, engineering deep dives, and customer stories from the team building WPistic.",
};

export default function BlogIndexPage() {
  return (
    <>
      <Section className="pt-16 pb-12 sm:pt-24">
        <Container>
          <Eyebrow>Blog</Eyebrow>
          <h1 className="font-display mt-4 max-w-2xl text-4xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-5xl">
            Notes on building the WPistic ecosystem
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">
            Product announcements, engineering write-ups, and real customer stories from the team
            shipping across the WPistic suite.
          </p>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="group">
                <Card hoverable className="flex h-full flex-col">
                  <div className="flex items-center justify-between gap-3">
                    <Badge tone="purple">{post.category}</Badge>
                    <span className="text-xs text-ink-400">{post.date}</span>
                  </div>
                  <h2 className="font-display mt-4 text-lg font-bold text-ink-900 group-hover:text-purple-600">
                    {post.title}
                  </h2>
                  <p className="mt-3 flex-1 text-[14px] leading-relaxed text-ink-600">
                    {post.excerpt}
                  </p>
                  <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
                    <span className="text-sm text-ink-500">{post.author}</span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-purple-600">
                      Read <Icon name="arrow" size={14} />
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="bg-ink-50">
        <Container className="text-center">
          <SectionHeading
            align="center"
            eyebrow="Stay in the loop"
            title="Product news, straight from the team"
            description="No newsletter form yet — for now, the fastest way to hear about new releases is to check back here or watch the roadmap."
          />
        </Container>
      </Section>
    </>
  );
}
