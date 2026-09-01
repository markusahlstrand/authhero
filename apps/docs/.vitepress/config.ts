import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The weekly changelog, read from the filesystem rather than listed by hand.
 *
 * Every other sidebar section is a curated order. The changelog is not: it is one
 * page per week, newest first, forever. A hand-maintained list of those would be a
 * second description of a directory listing, so the directory *is* the list, and an
 * entry added by Monday's digest reaches the nav with nothing else to remember.
 */
const CHANGELOG_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../changelog",
);
function changelogSidebar() {
  const entries = existsSync(CHANGELOG_DIR)
    ? readdirSync(CHANGELOG_DIR)
        .filter((f) => f.endsWith(".md") && f !== "index.md")
        .sort()
        .reverse()
    : [];
  return entries.map((file) => {
    const slug = file.replace(/\.md$/, "");
    const raw = readFileSync(join(CHANGELOG_DIR, file), "utf8");
    const title = /^title:\s*(.+)$/m
      .exec(raw)?.[1]
      .trim()
      .replace(/^['"]|['"]$/g, "");
    return { text: title ?? slug, link: `/changelog/${slug}` };
  });
}

// https://vitepress.dev/reference/site-config
export default withMermaid(
  defineConfig({
    title: "AuthHero",
    description: "Multi-tenant authentication system built on modern standards",
    vite: {
      optimizeDeps: {
        include: ["dayjs", "mermaid"],
      },
    },
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
        { text: "Architecture", link: "/architecture/" },
        { text: "Standards", link: "/standards/" },
        { text: "API Reference", link: "/api/overview" },
        { text: "Changelog", link: "/changelog/" },
      ],

      sidebar: [
        {
          text: "Getting Started",
          items: [
            { text: "What is AuthHero?", link: "/" },
            { text: "Installation", link: "/getting-started" },
            { text: "Your First Login", link: "/first-login" },
          ],
        },
        {
          text: "Architecture",
          collapsed: false,
          items: [
            { text: "Overview", link: "/architecture/" },
            {
              text: "The AuthHero Package",
              link: "/architecture/authhero-package",
            },
            {
              text: "Auth0 Compatibility",
              link: "/architecture/auth0-compatibility",
            },
            {
              text: "Universal Login",
              link: "/architecture/universal-login",
            },
            {
              text: "Login Flow (endpoints)",
              link: "/architecture/login-flow",
            },
            { text: "Adapters", link: "/architecture/adapters" },
            { text: "Audit Events", link: "/architecture/audit-events" },
            {
              text: "Audit Archive (Design)",
              link: "/architecture/audit-archive",
            },
            {
              text: "Hooks & Outbox Pipeline",
              link: "/architecture/hooks-pipeline",
            },
            { text: "Multi-Tenancy", link: "/architecture/multi-tenancy" },
          ],
        },
        {
          text: "Entities",
          collapsed: false,
          items: [
            { text: "Overview", link: "/entities/" },
            {
              text: "Identity",
              collapsed: false,
              items: [
                { text: "Users", link: "/entities/identity/users" },
                {
                  text: "Organizations",
                  link: "/entities/identity/organizations",
                },
              ],
            },
            {
              text: "Configuration",
              collapsed: false,
              items: [
                {
                  text: "Tenants",
                  link: "/entities/configuration/tenants",
                },
                {
                  text: "Applications",
                  link: "/entities/configuration/applications",
                },
                {
                  text: "Connections",
                  link: "/entities/configuration/connections",
                },
                {
                  text: "Domains",
                  link: "/entities/configuration/domains",
                },
              ],
            },
            {
              text: "Security",
              collapsed: false,
              items: [
                {
                  text: "Resource Servers",
                  link: "/entities/security/resource-servers",
                },
                { text: "Tokens", link: "/entities/security/tokens" },
                {
                  text: "Roles & Permissions",
                  link: "/entities/security/roles-permissions",
                },
              ],
            },
          ],
        },
        {
          text: "Features",
          collapsed: false,
          items: [
            { text: "Overview", link: "/features/" },
            {
              text: "Authentication Flows",
              link: "/features/authentication-flows",
            },
            {
              text: "SPA Authentication",
              link: "/features/spa-authentication",
            },
            {
              text: "Multi-Factor Authentication",
              link: "/features/mfa",
            },
            { text: "Hooks", link: "/features/hooks" },
            {
              text: "User Creation Flow",
              link: "/features/user-creation-flow",
            },
            {
              text: "Invitations & Tickets",
              link: "/features/invitations-and-tickets",
            },
            {
              text: "Email Templates",
              link: "/features/email-templates",
            },
            { text: "Account Linking", link: "/features/account-linking" },
            { text: "Impersonation", link: "/features/impersonation" },
            {
              text: "Session Management",
              link: "/features/session-management",
            },
            { text: "RBAC & Scopes", link: "/features/rbac-and-scopes" },
            {
              text: "SCIM Provisioning",
              link: "/features/scim-provisioning",
            },
            { text: "Forms", link: "/features/forms" },
            { text: "Flows", link: "/features/flows" },
            {
              text: "Multi-Tenant SaaS",
              link: "/features/multi-tenant-saas",
            },
            {
              text: "Tenant Export & Import",
              link: "/features/tenant-export-import",
            },
            { text: "Audit Logging", link: "/features/audit-logging" },
          ],
        },
        {
          text: "Standards",
          collapsed: false,
          items: [
            { text: "Overview", link: "/standards/" },
            {
              text: "OAuth 2.0",
              collapsed: false,
              items: [
                {
                  text: "RFC 6749 — Authorization Framework",
                  link: "/standards/rfc-6749",
                },
                {
                  text: "RFC 6750 — Bearer Tokens",
                  link: "/standards/rfc-6750",
                },
                { text: "RFC 7636 — PKCE", link: "/standards/rfc-7636" },
                {
                  text: "RFC 7009 — Token Revocation",
                  link: "/standards/rfc-7009",
                },
                {
                  text: "RFC 7591 — Dynamic Client Registration",
                  link: "/standards/rfc-7591",
                },
                {
                  text: "RFC 7592 — DCR Management",
                  link: "/standards/rfc-7592",
                },
                {
                  text: "RFC 8414 — Authorization Server Metadata",
                  link: "/standards/rfc-8414",
                },
                {
                  text: "Client ID Metadata Documents (CIMD)",
                  link: "/standards/cimd",
                },
                {
                  text: "RFC 9728 — Protected Resource Metadata",
                  link: "/standards/rfc-9728",
                },
                {
                  text: "RFC 7523 — JWT Client Authentication",
                  link: "/standards/rfc-7523",
                },
                {
                  text: "RFC 8693 — Token Exchange",
                  link: "/standards/rfc-8693",
                },
                {
                  text: "Connect Start (consent flow)",
                  link: "/standards/connect-start",
                },
              ],
            },
            {
              text: "Tokens & Keys",
              collapsed: false,
              items: [
                { text: "RFC 7517 — JWK", link: "/standards/rfc-7517" },
                { text: "RFC 7519 — JWT", link: "/standards/rfc-7519" },
                {
                  text: "RFC 7638 — JWK Thumbprint",
                  link: "/standards/rfc-7638",
                },
              ],
            },
            {
              text: "OpenID Connect",
              collapsed: false,
              items: [
                {
                  text: "OIDC Core 1.0",
                  link: "/standards/openid-connect-core",
                },
                {
                  text: "OIDC Discovery 1.0",
                  link: "/standards/openid-connect-discovery",
                },
                {
                  text: "OIDC RP-Initiated Logout 1.0",
                  link: "/standards/oidc-rp-initiated-logout",
                },
                {
                  text: "OIDC Back-Channel Logout 1.0",
                  link: "/standards/backchannel-logout",
                },
                {
                  text: "RFC 9101 — JAR (Request Objects)",
                  link: "/standards/rfc-9101",
                },
                {
                  text: "Form Post Response Mode",
                  link: "/standards/oauth2-form-post",
                },
              ],
            },
            {
              text: "Federation",
              collapsed: false,
              items: [{ text: "SAML 2.0", link: "/standards/saml-2" }],
            },
            {
              text: "Conformance Testing",
              link: "/standards/conformance",
            },
          ],
        },
        {
          text: "Security Model",
          collapsed: false,
          items: [
            { text: "Overview", link: "/security/" },
            {
              text: "RBAC, Scopes & Permissions",
              link: "/security/rbac",
            },
            {
              text: "Management API Security",
              link: "/security/management-api",
            },
            {
              text: "Multi-Tenancy & Organizations",
              link: "/security/multi-tenancy",
            },
            {
              text: "Encryption at Rest",
              link: "/security/encryption-at-rest",
            },
          ],
        },
        {
          text: "Database",
          collapsed: true,
          items: [
            { text: "Overview", link: "/database/" },
            { text: "Schema", link: "/database/schema" },
            { text: "Migration Strategies", link: "/database/migration" },
            { text: "Integration", link: "/database/integration" },
          ],
        },
        {
          text: "Deployment",
          collapsed: true,
          items: [
            { text: "Overview", link: "/deployment/" },
            { text: "Docker", link: "/deployment/docker" },
            {
              text: "Cloudflare Workers",
              link: "/deployment/cloudflare",
            },
            {
              text: "Cloudflare Workers for Platforms",
              link: "/deployment/cloudflare-wfp",
            },
            { text: "AWS", link: "/deployment/aws" },
            { text: "Local Development", link: "/deployment/local" },
            { text: "Multi-Cloud", link: "/deployment/multi-cloud" },
            {
              text: "Custom Domain Setup",
              link: "/deployment/custom-domain-setup",
            },
            {
              text: "Outbox Relay (Cron)",
              link: "/deployment/outbox-cron",
            },
            {
              text: "Data Retention",
              link: "/deployment/data-retention",
            },
            { text: "Widget Assets", link: "/deployment/widget-assets" },
          ],
        },
        {
          text: "Customization & Extensibility",
          collapsed: true,
          items: [
            { text: "Overview", link: "/customization/" },
            {
              text: "Adapter Interfaces",
              link: "/customization/adapter-interfaces/",
            },
            {
              text: "Outbox Adapter",
              link: "/customization/adapter-interfaces/outbox",
            },
            {
              text: "Rate Limit Adapter",
              link: "/customization/adapter-interfaces/rate-limit",
            },
            {
              text: "Failed Events (Dead-letter)",
              link: "/customization/failed-events",
            },
            {
              text: "Built-in Adapters",
              link: "/customization/built-in-adapters",
              collapsed: true,
              items: [
                { text: "Drizzle", link: "/customization/drizzle/" },
                { text: "Kysely", link: "/customization/kysely/" },
                { text: "AWS (DynamoDB)", link: "/customization/aws-adapter/" },
                {
                  text: "Cloudflare",
                  link: "/customization/cloudflare-adapter/",
                  collapsed: true,
                  items: [
                    {
                      text: "Custom Domains",
                      link: "/customization/cloudflare-adapter/custom-domains",
                    },
                    {
                      text: "Analytics Engine",
                      link: "/customization/cloudflare-adapter/analytics-engine",
                    },
                    {
                      text: "R2 SQL",
                      link: "/customization/cloudflare-adapter/r2-sql",
                    },
                    {
                      text: "Cache",
                      link: "/customization/cloudflare-adapter/cache",
                    },
                  ],
                },
              ],
            },
            {
              text: "Custom Auth Middleware",
              link: "/customization/custom-authorization-middleware",
            },
            {
              text: "UI Widget",
              link: "/customization/ui-widget/",
              collapsed: true,
              items: [
                {
                  text: "Getting Started",
                  link: "/customization/ui-widget/getting-started",
                },
                {
                  text: "SSR & Hydration",
                  link: "/customization/ui-widget/ssr-hydration",
                },
                {
                  text: "Props & Events",
                  link: "/customization/ui-widget/props-events",
                },
                {
                  text: "Integration Patterns",
                  link: "/customization/ui-widget/integration-patterns",
                },
                {
                  text: "Customization",
                  link: "/customization/ui-widget/customization",
                },
                {
                  text: "Page Templates (Liquid)",
                  link: "/customization/ui-widget/liquid-templates",
                },
                {
                  text: "Client–Server Protocol",
                  link: "/customization/ui-widget/client-server-protocol",
                },
                {
                  text: "API Reference",
                  link: "/customization/ui-widget/api-reference",
                },
              ],
            },
            {
              text: "SAML Package",
              link: "/customization/saml/",
              collapsed: true,
              items: [
                {
                  text: "Configuration",
                  link: "/customization/saml/configuration",
                },
                {
                  text: "Custom Signers",
                  link: "/customization/saml/custom-signers",
                },
                {
                  text: "API Reference",
                  link: "/customization/saml/api-reference",
                },
              ],
            },
            {
              text: "Multi-Tenancy Package",
              link: "/customization/multi-tenancy/",
              collapsed: true,
              items: [
                {
                  text: "Architecture",
                  link: "/customization/multi-tenancy/architecture",
                },
                {
                  text: "Control Plane",
                  link: "/customization/multi-tenancy/control-plane",
                },
                {
                  text: "Database Isolation",
                  link: "/customization/multi-tenancy/database-isolation",
                },
                {
                  text: "Tenant Lifecycle",
                  link: "/customization/multi-tenancy/tenant-lifecycle",
                },
                {
                  text: "Tenant Operations",
                  link: "/customization/multi-tenancy/tenant-operations",
                },
                {
                  text: "Runtime Fallback",
                  link: "/customization/multi-tenancy/runtime-fallback",
                },
                {
                  text: "Control Plane Defaults (WFP)",
                  link: "/customization/multi-tenancy/control-plane-defaults",
                },
                {
                  text: "Subdomain Routing",
                  link: "/customization/multi-tenancy/subdomain-routing",
                },
                {
                  text: "API Reference",
                  link: "/customization/multi-tenancy/api-reference",
                },
                {
                  text: "Migration Guide",
                  link: "/customization/multi-tenancy/migration",
                },
              ],
            },
            {
              text: "Proxy Package",
              link: "/customization/proxy/",
              collapsed: true,
              items: [
                {
                  text: "Handlers",
                  link: "/customization/proxy/handlers",
                },
                {
                  text: "Host Caching",
                  link: "/customization/proxy/caching",
                },
                {
                  text: "Deployment Topologies",
                  link: "/customization/proxy/deployment",
                },
                {
                  text: "API Reference",
                  link: "/customization/proxy/api-reference",
                },
              ],
            },
            {
              text: "Core Configuration",
              link: "/customization/configuration",
            },
            {
              text: "Hono Variables",
              link: "/customization/hono-variables",
            },
          ],
        },
        {
          text: "Apps & Tools",
          collapsed: true,
          items: [
            {
              text: "Create AuthHero CLI",
              link: "/packages/create-authhero/",
              collapsed: true,
              items: [
                { text: "Usage", link: "/packages/create-authhero/usage" },
                {
                  text: "Commands",
                  link: "/packages/create-authhero/commands",
                },
              ],
            },
            {
              text: "Admin Dashboard",
              link: "/apps/admin/",
              collapsed: true,
              items: [
                { text: "Installation", link: "/apps/admin/installation" },
                { text: "Usage", link: "/apps/admin/usage" },
                { text: "Development", link: "/apps/admin/development" },
              ],
            },
          ],
        },
        {
          text: "Auth0 Comparison",
          collapsed: true,
          items: [
            { text: "Overview", link: "/auth0-comparison/" },
            {
              text: "Account Linking",
              link: "/auth0-comparison/account-linking",
            },
            {
              text: "Bulk User Import",
              link: "/auth0-comparison/bulk-user-import",
            },
            {
              text: "Email Templates",
              link: "/auth0-comparison/email-templates",
            },
            { text: "Hooks", link: "/auth0-comparison/hooks" },
            {
              text: "Lazy Migration",
              link: "/auth0-comparison/lazy-migration",
            },
            { text: "Multi-Tenant", link: "/auth0-comparison/multi-tenant" },
            {
              text: "Redirect URLs",
              link: "/auth0-comparison/redirect-urls",
            },
            {
              text: "SAML Migration",
              link: "/auth0-comparison/saml-migration",
            },
            { text: "Terraform", link: "/auth0-comparison/terraform" },
          ],
        },
        {
          text: "API Reference",
          collapsed: true,
          items: [
            { text: "Overview", link: "/api/overview" },
            { text: "Endpoints", link: "/api/endpoints" },
            { text: "Pagination", link: "/api/pagination" },
            { text: "Prefer Header", link: "/api/prefer-header" },
            { text: "Error Codes", link: "/api/error-codes" },
          ],
        },
        {
          text: "Contributing",
          collapsed: true,
          items: [
            {
              text: "Development Setup",
              link: "/contributing/development-setup",
            },
            { text: "Code Style", link: "/contributing/code-style" },
            { text: "Testing", link: "/contributing/testing" },
            { text: "Release Process", link: "/contributing/release-process" },
            { text: "Troubleshooting", link: "/troubleshooting" },
          ],
        },
        {
          text: "Changelog",
          collapsed: true,
          items: [
            { text: "Overview", link: "/changelog/" },
            ...changelogSidebar(),
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
        message: "Dual-licensed: AGPL-3.0-only or commercial license.",
        copyright: "Copyright © 2025 AuthHero",
      },
    },
  }),
);
