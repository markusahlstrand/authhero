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
        { text: "Architecture", link: "/architecture/" },
        { text: "Standards", link: "/standards/" },
        { text: "API Reference", link: "/api/overview" },
        { text: "Roadmap", link: "/roadmap" },
      ],

      sidebar: [
        {
          text: "Getting Started",
          items: [
            { text: "What is AuthHero?", link: "/" },
            { text: "Installation", link: "/getting-started" },
            { text: "Roadmap", link: "/roadmap" },
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
            { text: "Account Linking", link: "/features/account-linking" },
            { text: "Impersonation", link: "/features/impersonation" },
            {
              text: "Session Management",
              link: "/features/session-management",
            },
            { text: "RBAC & Scopes", link: "/features/rbac-and-scopes" },
            { text: "Forms", link: "/features/forms" },
            { text: "Flows", link: "/features/flows" },
            {
              text: "Multi-Tenant SaaS",
              link: "/features/multi-tenant-saas",
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
                  text: "RFC 7591 — Dynamic Client Registration",
                  link: "/standards/rfc-7591",
                },
                {
                  text: "RFC 7592 — DCR Management",
                  link: "/standards/rfc-7592",
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
                  text: "Form Post Response Mode",
                  link: "/standards/oauth2-form-post",
                },
              ],
            },
            {
              text: "Federation",
              collapsed: false,
              items: [
                { text: "SAML 2.0", link: "/standards/saml-2" },
              ],
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
              text: "Failed Events (Dead-letter)",
              link: "/customization/failed-events",
            },
            {
              text: "Built-in Adapters",
              link: "/customization/built-in-adapters",
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
                  text: "Runtime Fallback",
                  link: "/customization/multi-tenancy/runtime-fallback",
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
          text: "Auth0 Comparison",
          collapsed: true,
          items: [
            { text: "Overview", link: "/auth0-comparison/" },
            {
              text: "Account Linking",
              link: "/auth0-comparison/account-linking",
            },
            { text: "Hooks", link: "/auth0-comparison/hooks" },
            { text: "Multi-Tenant", link: "/auth0-comparison/multi-tenant" },
            {
              text: "Redirect URLs",
              link: "/auth0-comparison/redirect-urls",
            },
            {
              text: "SAML Migration",
              link: "/auth0-comparison/saml-migration",
            },
          ],
        },
        {
          text: "API Reference",
          collapsed: true,
          items: [
            { text: "Overview", link: "/api/overview" },
            { text: "Endpoints", link: "/api/endpoints" },
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
