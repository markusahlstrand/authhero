import { Link, useLoaderData } from "react-router-dom";
import { Head } from "vite-react-ssg";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import FadeIn from "@/components/FadeIn";
import GridBackground from "@/components/GridBackground";
import NotFound from "./NotFound";
import type { BlogPostMeta } from "@/content/blog/posts";
import { formatDate } from "@/lib/format";

export interface PostLoaderData {
  meta: BlogPostMeta | null;
  content: string | null;
}

const isPostLoaderData = (value: unknown): value is PostLoaderData =>
  typeof value === "object" && value !== null && "meta" in value && "content" in value;

const BlogPost = () => {
  const raw = useLoaderData();
  const { meta, content }: PostLoaderData = isPostLoaderData(raw)
    ? raw
    : { meta: null, content: null };

  if (!meta) return <NotFound />;

  return (
    <main>
      <Head>
        <title>{`${meta.title} · AuthHero`}</title>
        <meta name="description" content={meta.excerpt} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={meta.title} />
        <meta property="og:description" content={meta.excerpt} />
        <meta name="twitter:title" content={meta.title} />
        <meta name="twitter:description" content={meta.excerpt} />
      </Head>

      <GridBackground>
        <section className="container pt-16 pb-10 md:pt-24 md:pb-12 max-w-2xl">
          <FadeIn>
            <Link
              to="/blog"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              Back to blog
            </Link>
            <time className="block text-xs text-muted-foreground mb-3">
              {formatDate(meta.date)} · {meta.author}
            </time>
            <h1 className="text-3xl md:text-4xl font-semibold leading-tight tracking-tight">
              {meta.title}
            </h1>
          </FadeIn>
        </section>
      </GridBackground>

      <article className="container pb-24 max-w-2xl">
        <FadeIn>
          {content === null ? (
            <p className="text-muted-foreground">
              This post could not be loaded.{" "}
              <Link to="/blog" className="text-accent">
                Back to blog
              </Link>
              .
            </p>
          ) : (
            <div className="prose prose-neutral max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-accent prose-a:font-normal prose-code:before:content-none prose-code:after:content-none prose-blockquote:border-l-accent prose-blockquote:not-italic prose-blockquote:font-normal prose-blockquote:text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          )}
        </FadeIn>
      </article>
    </main>
  );
};

export default BlogPost;
