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
      // Favicon and icons
      ["link", { rel: "icon", href: "/favicon.ico" }],
      [
        "link",
        {
          rel: "icon",
          type: "image/png",
          sizes: "32x32",
          href: "/favicon.ico",
        },
      ],
      ["link", { rel: "apple-touch-icon", href: "/favicon.ico" }],

      // Primary meta tags
      ["meta", { name: "theme-color", content: "#3B82F6" }],
      [
        "meta",
        {
          name: "description",
          content:
            "AuthHero is an open-source, multi-tenant authentication system with Auth0 API compatibility. Self-host your identity management with enterprise features.",
        },
      ],
      [
        "meta",
        {
          name: "keywords",
          content:
            "authentication, auth0, identity management, multi-tenant, open source, oauth2, oidc, self-hosted, identity provider",
        },
      ],
      ["meta", { name: "author", content: "AuthHero" }],
      ["meta", { name: "robots", content: "index, follow" }],

      // Open Graph / Facebook
      ["meta", { property: "og:type", content: "website" }],
      ["meta", { property: "og:locale", content: "en_US" }],
      ["meta", { property: "og:site_name", content: "AuthHero" }],
      ["meta", { property: "og:url", content: "https://www.authhero.net/" }],
      [
        "meta",
        {
          property: "og:title",
          content: "AuthHero | Open-Source Multi-tenant Authentication",
        },
      ],
      [
        "meta",
        {
          property: "og:description",
          content:
            "Self-host your authentication with Auth0 API compatibility. Enterprise-grade identity management that you control.",
        },
      ],
      [
        "meta",
        {
          property: "og:image",
          content: "https://www.authhero.net/og-image.png",
        },
      ],
      ["meta", { property: "og:image:width", content: "1200" }],
      ["meta", { property: "og:image:height", content: "630" }],

      // Twitter
      ["meta", { name: "twitter:card", content: "summary_large_image" }],
      ["meta", { name: "twitter:site", content: "@authhero" }],
      [
        "meta",
        {
          name: "twitter:title",
          content: "AuthHero | Open-Source Multi-tenant Authentication",
        },
      ],
      [
        "meta",
        {
          name: "twitter:description",
          content:
            "Self-host your authentication with Auth0 API compatibility. Enterprise-grade identity management that you control.",
        },
      ],
      [
        "meta",
        {
          name: "twitter:image",
          content: "https://www.authhero.net/og-image.png",
        },
      ],

      // Canonical URL
      ["link", { rel: "canonical", href: "https://www.authhero.net/" }],

      // Google Analytics
      [
        "script",
        {
          async: "",
          src: "https://www.googletagmanager.com/gtag/js?id=G-DNZWG3PF2L",
        },
      ],
      [
        "script",
        {},
        `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-DNZWG3PF2L');`,
      ],
    ],
    sitemap: {
      hostname: "https://www.authhero.net",
    },
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
            { text: "Security Model", link: "/security-model" },
          ],
        },
        {
          text: "Concepts",
          collapsed: false,
          items: [
            { text: "Overview", link: "/concepts/" },
            { text: "Tenants", link: "/concepts/tenants" },
            { text: "Applications", link: "/concepts/applications" },
            { text: "Connections", link: "/concepts/connections" },
            { text: "Users", link: "/concepts/users" },
            { text: "Organizations", link: "/concepts/organizations" },
            { text: "Resource Servers", link: "/concepts/resource-servers" },
            { text: "Tokens", link: "/concepts/tokens" },
            { text: "Hooks", link: "/concepts/hooks" },
            { text: "Adapters", link: "/concepts/adapters" },
          ],
        },
        {
          text: "Deployment Targets",
          collapsed: false,
          items: [
            { text: "Overview", link: "/deployment-targets/" },
            { text: "Local Development", link: "/deployment-targets/local" },
            {
              text: "Cloudflare Workers",
              link: "/deployment-targets/cloudflare",
            },
            { text: "AWS", link: "/deployment-targets/aws" },
            { text: "Multi-Cloud", link: "/deployment-targets/multi-cloud" },
            {
              text: "Widget Assets",
              link: "/deployment-targets/widget-assets",
            },
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
            { text: "Overview", link: "/packages/overview" },
            { text: "Core Library", link: "/packages/authhero/" },
            { text: "UI Widget", link: "/packages/ui-widget" },
            {
              text: "Multi-Tenancy",
              link: "/packages/multi-tenancy/",
              collapsed: false,
              items: [
                {
                  text: "Architecture",
                  link: "/packages/multi-tenancy/architecture",
                },
                {
                  text: "Database Isolation",
                  link: "/packages/multi-tenancy/database-isolation",
                },
                {
                  text: "Tenant Lifecycle",
                  link: "/packages/multi-tenancy/tenant-lifecycle",
                },
                {
                  text: "Runtime Fallback",
                  link: "/packages/multi-tenancy/runtime-fallback",
                },
                {
                  text: "Subdomain Routing",
                  link: "/packages/multi-tenancy/subdomain-routing",
                },
                {
                  text: "API Reference",
                  link: "/packages/multi-tenancy/api-reference",
                },
                {
                  text: "Migration Guide",
                  link: "/packages/multi-tenancy/migration",
                },
              ],
            },
            { text: "SAML", link: "/packages/saml/" },
            { text: "AWS Adapter", link: "/adapters/aws/" },
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
            { text: "AWS (DynamoDB)", link: "/adapters/aws/" },
            {
              text: "Cloudflare",
              link: "/adapters/cloudflare/",
              items: [
                { text: "Overview", link: "/adapters/cloudflare/" },
                {
                  text: "Custom Domains",
                  link: "/adapters/cloudflare/custom-domains",
                },
                { text: "Cache", link: "/adapters/cloudflare/cache" },
                {
                  text: "Analytics Engine",
                  link: "/adapters/cloudflare/analytics-engine",
                },
                { text: "R2 SQL", link: "/adapters/cloudflare/r2-sql" },
              ],
            },
          ],
        },
        {
          text: "API Reference",
          items: [
            { text: "Overview", link: "/api/overview" },
            { text: "Endpoints", link: "/api/endpoints" },
            { text: "Error Codes", link: "/api/error-codes" },
            { text: "Forms", link: "/api/forms" },
            { text: "Flows", link: "/api/flows" },
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
              text: "Custom Authorization Middleware",
              link: "/guides/custom-authorization-middleware",
            },
            {
              text: "Custom Domain Setup",
              link: "/guides/custom-domain-setup",
            },
            {
              text: "Database Integration",
              link: "/guides/database-integration",
            },
            {
              text: "Database Migration",
              link: "/guides/database-migration",
            },
            { text: "Impersonation", link: "/guides/impersonation" },
            {
              text: "Multi-Tenant SaaS Setup",
              link: "/guides/multi-tenant-saas-setup",
            },
            { text: "RBAC and Scopes", link: "/guides/rbac-and-scopes" },
            { text: "SAML Migration", link: "/guides/saml-migration" },
            {
              text: "SPA Authentication",
              link: "/guides/spa-authentication",
            },
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
        message: "Released under the MIT License.",
        copyright: "Copyright © 2025 AuthHero",
      },
    },
  }),
);
