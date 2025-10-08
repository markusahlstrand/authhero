import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

// https://vitepress.dev/reference/site-config
export default withMermaid(
  defineConfig({
    title: "AuthHero",
    description: "Multi-tenant authentication system built on modern standards",
    mermaid: {
      theme: "neutral",
      themeVariables: {
        primaryColor: "#f9f9f9",
        primaryTextColor: "#213547",
        primaryBorderColor: "#cccccc",
        lineColor: "#333333",
        secondaryColor: "#ffffff",
        tertiaryColor: "#f9f9f9",
        background: "#ffffff",
        mainBkg: "#ffffff",
        secondBkg: "#f8fafc",
        tertiaryBkg: "#f1f5f9",
        entityFillColor: "#ffffff",
        entityBorderColor: "#cccccc",
      },
    },
    head: [
      ["link", { rel: "icon", href: "/favicon.ico" }],
      ["meta", { name: "theme-color", content: "#3B82F6" }],
      ["meta", { property: "og:type", content: "website" }],
      ["meta", { property: "og:locale", content: "en" }],
      [
        "meta",
        {
          property: "og:title",
          content: "AuthHero | Multi-tenant Authentication System",
        },
      ],
      ["meta", { property: "og:site_name", content: "AuthHero" }],
      ["meta", { property: "og:url", content: "https://authhero.dev/" }],
    ],
    lastUpdated: true,
    cleanUrls: true,
    themeConfig: {
      // https://vitepress.dev/reference/default-theme-config
      nav: [
        { text: "Home", link: "/" },
        { text: "Getting Started", link: "/getting-started" },
        { text: "Components", link: "/components/" },
        { text: "API Reference", link: "/api/" },
      ],

      sidebar: [
        {
          text: "Introduction",
          items: [
            { text: "What is AuthHero?", link: "/" },
            { text: "Getting Started", link: "/getting-started" },
            { text: "Architecture", link: "/architecture" },
            { text: "Database Schema", link: "/database-schema" },
            { text: "Concepts", link: "/concepts" },
          ],
        },
        {
          text: "Applications",
          items: [
            { text: "React Admin", link: "/apps/react-admin/" },
            { text: "Auth0 Proxy", link: "/apps/auth0-proxy/" },
            { text: "Demo App", link: "/apps/demo/" },
          ],
        },
        {
          text: "Packages",
          items: [
            { text: "Core Library", link: "/packages/authhero/" },
            { text: "Create AuthHero", link: "/packages/create-authhero/" },
          ],
        },
        {
          text: "Components",
          items: [{ text: "Overview", link: "/components/" }],
        },
        {
          text: "Adapters",
          items: [
            { text: "Overview", link: "/adapters/" },
            { text: "Interfaces", link: "/adapters/interfaces/" },
            { text: "Kysely (SQL)", link: "/adapters/kysely/" },
            { text: "Drizzle (SQL)", link: "/adapters/drizzle/" },
            { text: "Cloudflare", link: "/adapters/cloudflare/" },
          ],
        },
        {
          text: "API Reference",
          items: [
            { text: "Overview", link: "/api/overview" },
            { text: "Endpoints", link: "/api/endpoints" },
            { text: "Error Codes", link: "/api/error-codes" },
            { text: "Forms", link: "/api/forms" },
          ],
        },
        {
          text: "Guides",
          items: [
            {
              text: "Authentication Flow",
              link: "/guides/authentication-flow",
            },
            {
              text: "Custom Domain Setup",
              link: "/guides/custom-domain-setup",
            },
            {
              text: "Database Integration",
              link: "/guides/database-integration",
            },
            { text: "Impersonation", link: "/guides/impersonation" },
            { text: "Troubleshooting", link: "/guides/troubleshooting" },
          ],
        },
        {
          text: "Auth0 Comparison",
          items: [
            { text: "Overview", link: "/auth0-comparison/" },
            { text: "Hooks", link: "/auth0-comparison/hooks" },
            { text: "Multi-Tenant", link: "/auth0-comparison/multi-tenant" },
            { text: "Redirect URLs", link: "/auth0-comparison/redirect-urls" },
          ],
        },
        {
          text: "Contributing",
          items: [
            {
              text: "Development Setup",
              link: "/contributing/development-setup",
            },
            { text: "Code Style", link: "/contributing/code-style" },
            { text: "Testing", link: "/contributing/testing" },
            { text: "Release Process", link: "/contributing/release-process" },
          ],
        },
      ],

      socialLinks: [
        { icon: "github", link: "https://github.com/markusahlstrand/authhero" },
      ],

      search: {
        provider: "local",
      },

      footer: {
        message: "Released under the ISC License.",
        copyright: "Copyright © 2025 AuthHero",
      },
    },
  }),
);
