git u---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "AuthHero"
  text: "Open Source User Management"
  tagline: "Multi-tenant, scalable, built on modern standards. Support for any JavaScript runtime."
  image:
    src: /logo.svg
    alt: AuthHero
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/markusahlstrand/authhero

features:
  - icon: 🚀
    title: Multi-tenant & Scalable
    details: Built-in multi-tenancy support with data isolation, custom branding, and domain management for each tenant.

  - icon: 🔒
    title: Comprehensive Auth Flows
    details: Login, signup, password reset, social auth, and enterprise connections. Everything you need for modern authentication.

  - icon: ⚡
    title: Fast & Lightweight
    details: Optimized for edge computing with support for Cloudflare Workers, Vercel Edge, and traditional Node.js environments.

  - icon: 🛠️
    title: Database Agnostic
    details: Works with your database of choice through adapters for Drizzle, Kysely, and direct SQL connections.

  - icon: 🎨
    title: Admin Dashboard
    details: Beautiful Admin interface for managing tenants, users, applications, and authentication settings.

  - icon: 🔌
    title: Auth0 Compatible
    details: Drop-in replacement for Auth0 with compatibility proxy. Migrate existing applications with minimal changes.

  - icon: 🪝
    title: Advanced Hooks
    details: Comprehensive lifecycle hooks including user deletion hooks (not available in Auth0). Full control over authentication flows.
---

## Quick Start

Get up and running with AuthHero in minutes:

::: code-group

```bash [npm]
npm create authhero@latest my-auth-app
cd my-auth-app
npm run dev
```

```bash [yarn]
yarn create authhero my-auth-app
cd my-auth-app
yarn dev
```

```bash [pnpm]
pnpm create authhero my-auth-app
cd my-auth-app
pnpm dev
```

:::

## Simple Example

```typescript
import { Hono } from "hono";
import { createAuthHero } from "authhero";

const app = new Hono();

// Initialize AuthHero
const auth = createAuthHero({
  database: adapter,
  tenant: "your-tenant",
});

// Add authentication middleware
app.use("*", auth.middleware);

// Protect routes
app.get("/dashboard", auth.requireAuth(), (c) => {
  const user = c.get("user");
  return c.json({ message: `Hello ${user.email}!` });
});

export default app;
```

## Why AuthHero?

AuthHero combines the best of modern authentication with enterprise-grade features:

- **Multi-tenant by Design** - Perfect for SaaS applications
- **Edge-First Architecture** - Optimized for global deployment
- **Developer Experience** - Simple APIs with powerful features
- **Migration Ready** - Auth0 compatibility for easy transitions
- **Open Source** - Full control over your authentication system

## Architecture

AuthHero is built as a modular system:

- **Core Library** - Authentication logic and middleware
- **Database Adapters** - Support for multiple databases
- **Admin Dashboard** - Management interface
- **Auth0 Proxy** - Compatibility layer for migration

[Learn more about the architecture →](./architecture.md)

- [API Reference](./api/overview.md) - Complete API documentation
- [Applications](./apps/react-admin/) - Explore the included applications
