import type { RouteRecord } from "vite-react-ssg";
import Layout from "./Layout";
import { posts, loadPostContent } from "./content/blog/posts";

// Pages use default exports; adapt them to react-router's `lazy` convention
// (which expects a `Component`) so each route stays code-split.
const page =
  (loader: () => Promise<{ default: React.ComponentType }>) => async () => ({
    Component: (await loader()).default,
  });

export const routes: RouteRecord[] = [
  {
    path: "/",
    element: <Layout />,
    entry: "src/Layout.tsx",
    children: [
      { index: true, lazy: page(() => import("./pages/Index")) },
      { path: "pricing", lazy: page(() => import("./pages/Pricing")) },
      { path: "migration", lazy: page(() => import("./pages/VsAuth0")) },
      { path: "deploy", lazy: page(() => import("./pages/Deploy")) },
      { path: "blog", lazy: page(() => import("./pages/Blog")) },
      {
        path: "blog/:slug",
        lazy: page(() => import("./pages/BlogPost")),
        entry: "src/pages/BlogPost.tsx",
        // The loader runs at build time (and on client navigation), so the
        // article body is baked into the prerendered HTML for SEO. It still
        // dynamic-imports only the requested post, keeping per-post chunks.
        loader: async ({ params }) => {
          const slug = params.slug ?? "";
          const meta = posts.find((post) => post.slug === slug) ?? null;
          const content = meta ? await loadPostContent(slug) : null;
          return { meta, content };
        },
        // Prerender one HTML file per known post.
        getStaticPaths: () => posts.map((post) => `blog/${post.slug}`),
      },
      { path: "*", lazy: page(() => import("./pages/NotFound")) },
    ],
  },
];
