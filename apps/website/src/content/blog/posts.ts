export interface BlogPostMeta {
  slug: string;
  title: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  author: string;
  excerpt: string;
}

// Metadata only. This is small and stays in the main bundle so the blog index
// renders instantly without fetching anything. Newest first. Adding a post adds
// a few hundred bytes here, not the whole article body. Newest first.
export const posts: BlogPostMeta[] = [
  {
    slug: "outbox-pattern-edge-audit-logs",
    title: "Why We Bet on the Outbox Pattern for AuthHero's Audit Logs",
    date: "2026-06-17",
    author: "The AuthHero Team",
    excerpt:
      "Dual writes quietly drop security events when the network blinks. Here's how we use a transactional outbox to guarantee zero data loss in our audit pipeline, even on Cloudflare D1 and PlanetScale, where CDC isn't an option.",
  },
  {
    slug: "rebuilding-auth0-taught-me-about-constraints",
    title: "What rebuilding Auth0 taught me about constraints",
    date: "2026-03-15",
    author: "Markus Ahlstrand",
    excerpt:
      "We set out to build a better Auth0 and ended up rebuilding the same Auth0, somewhere else, owned by you. A story about the constraints that turned out to set us free.",
  },
];

export const getPostMeta = (slug: string): BlogPostMeta | undefined =>
  posts.find((post) => post.slug === slug);

// Each post body is a separate, lazily-loaded chunk. Vite code-splits every
// dynamic import(), so a body is only fetched (from the edge cache) when that
// post is opened — and the main bundle never grows as posts are added.
const contentLoaders: Record<string, () => Promise<{ default: string }>> = {
  "outbox-pattern-edge-audit-logs": () => import("./outbox-pattern-edge-audit-logs.md?raw"),
  "rebuilding-auth0-taught-me-about-constraints": () =>
    import("./rebuilding-auth0-taught-me-about-constraints.md?raw"),
};

export const loadPostContent = async (slug: string): Promise<string | null> => {
  const loader = contentLoaders[slug];
  if (!loader) return null;
  return (await loader()).default;
};
