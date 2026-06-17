import { Link } from "react-router-dom";
import FadeIn from "@/components/FadeIn";
import GridBackground from "@/components/GridBackground";
import { posts } from "@/content/blog/posts";
import { formatDate } from "@/lib/format";

const Blog = () => (
  <main>
    <GridBackground>
      <section className="container py-28 md:py-36 text-center">
        <FadeIn>
          <h1 className="text-4xl md:text-5xl font-semibold mb-4">Blog</h1>
          <p className="text-muted-foreground text-lg">Engineering insights from the AuthHero team.</p>
        </FadeIn>
      </section>
    </GridBackground>

    <section className="container pb-24 max-w-2xl">
      {posts.map((post, i) => (
        <FadeIn key={post.slug} delay={i * 0.05}>
          <Link to={`/blog/${post.slug}`} className="group block py-8 border-b border-border last:border-0">
            <time className="text-xs text-muted-foreground">{formatDate(post.date)}</time>
            <h2 className="text-lg font-semibold mt-1 mb-2 group-hover:text-accent transition-colors">
              {post.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{post.excerpt}</p>
          </Link>
        </FadeIn>
      ))}
    </section>
  </main>
);

export default Blog;
