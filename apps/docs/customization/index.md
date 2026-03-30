---
title: Customization & Extensibility
description: Embed AuthHero in your own application, write custom adapters, extend the UI, and take full control of your authentication stack.
---

# Customization & Extensibility

AuthHero isn't just a standalone service — it's a library you can embed directly in your Node.js process. This section is for developers who want full control over their authentication stack.

## Why Customize?

- **Embed in your process** — Run AuthHero as part of your existing Hono/Express/Fastify app instead of as a separate service
- **Custom adapters** — Use any database, cache, or storage backend
- **Custom auth logic** — Add middleware, modify token claims, integrate with internal systems
- **Custom UI** — Build your own login experience using the widget or from scratch
- **Platform-specific** — Optimize for your hosting environment (Cloudflare, AWS, bare metal)

## Getting Started

Install the core package:

```bash
pnpm install authhero @authhero/kysely-adapter
```

Create an app and mount it:

```typescript
import { createApp } from "authhero";
import { createKyselyAdapters } from "@authhero/kysely-adapter";

const adapters = createKyselyAdapters(db);
const app = createApp({ dataAdapter: adapters });

// Mount as part of your existing Hono app
mainApp.route("/auth", app);
```

## What's in This Section

- **[Adapter Interfaces](/customization/adapter-interfaces/)** — The TypeScript interfaces your adapter must implement
- **[Built-in Adapters](/customization/built-in-adapters)** — Kysely, Drizzle, AWS, and Cloudflare adapter details
- **[Custom Authorization Middleware](/customization/custom-authorization-middleware)** — Add custom auth logic to your API
- **[UI Widget](/customization/ui-widget/)** — Integrate, customize, and extend the login widget
- **[SAML Package](/customization/saml/)** — SAML 2.0 support with pluggable signing strategies
- **[Multi-Tenancy Package](/customization/multi-tenancy/)** — Advanced multi-tenant features for B2B SaaS
- **[Core Configuration](/customization/configuration)** — Hono variables, hooks, and initialization options
