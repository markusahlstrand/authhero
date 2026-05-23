---
title: Admin Installation
description: Install, configure and whitelabel the AuthHero Admin Dashboard. Environment variables, runtime config, and production deployment.
---

# Admin Dashboard Installation

## Prerequisites

- Node.js v20 or higher
- pnpm v10 or higher
- A running AuthHero backend exposing the management API

## Installation Steps

1. Clone the AuthHero repository

```bash
git clone https://github.com/markusahlstrand/authhero.git
cd authhero
pnpm install
```

2. From the repo root, work with the admin app via the `admin` script:

```bash
pnpm admin dev        # development server on http://localhost:5173
pnpm admin build      # production bundle in apps/admin/dist
```

Or from inside `apps/admin`:

```bash
pnpm dev
pnpm build
```

## Configuration

The admin reads configuration from two sources, in priority order:

1. **Runtime config** — `window.__AUTHHERO_ADMIN_CONFIG__`, injected by the host page before the bundle loads. Lets you ship one static build to multiple environments.
2. **Build-time env vars** — `VITE_*` variables baked in at `pnpm build` time.

Both paths use the same keys.

### All settings

| Setting | Env var | Runtime key | Default | Description |
| --- | --- | --- | --- | --- |
| Auth0 domain | `VITE_AUTH0_DOMAIN` | `domain` | — | Tenant domain used by `@auth0/auth0-spa-js` to log the admin user in. If unset, the user is prompted to pick a domain on first load. |
| Auth0 client ID | `VITE_AUTH0_CLIENT_ID` | `clientId` | — | SPA application client ID for the admin itself. |
| Management API URL | `VITE_AUTH0_API_URL` | `apiUrl` | — | Base URL of the AuthHero management API. |
| Auth0 audience | `VITE_AUTH0_AUDIENCE` | `audience` | — | Audience requested for the management API access token. |
| Base path | `VITE_BASE_PATH` | `basePath` | `""` | Sub-path the admin is served from (e.g. `/admin`). Routes and the OAuth callback honor this. |
| App name | `VITE_APP_NAME` | `appName` | `"AuthHero Admin"` | Browser tab title and top-bar wordmark (when no logo is set). |
| Logo URL | `VITE_APP_LOGO_URL` | `logoUrl` | — | Image rendered in the top bar in place of the wordmark. PNG, SVG or WebP. Recommended height: 28px. |
| Favicon URL | `VITE_APP_FAVICON_URL` | `faviconUrl` | `./favicon.svg` | Overrides the built-in favicon. |

### Build-time `.env.local` example

```bash
VITE_AUTH0_DOMAIN=auth.example.com
VITE_AUTH0_CLIENT_ID=your-spa-client-id
VITE_AUTH0_API_URL=https://auth.example.com
VITE_AUTH0_AUDIENCE=https://auth.example.com/api/v2/
VITE_BASE_PATH=/admin

# Whitelabel
VITE_APP_NAME="Acme Identity Console"
VITE_APP_LOGO_URL=https://cdn.example.com/acme-logo.svg
VITE_APP_FAVICON_URL=https://cdn.example.com/acme-favicon.svg
```

### Runtime config example

Inject before the bundle to swap settings without rebuilding:

```html
<script>
  window.__AUTHHERO_ADMIN_CONFIG__ = {
    domain: "auth.example.com",
    clientId: "your-spa-client-id",
    apiUrl: "https://auth.example.com",
    audience: "https://auth.example.com/api/v2/",
    basePath: "/admin",
    appName: "Acme Identity Console",
    logoUrl: "https://cdn.example.com/acme-logo.svg",
    faviconUrl: "https://cdn.example.com/acme-favicon.svg",
  };
</script>
<script type="module" src="/admin/assets/index.js"></script>
```

## Whitelabeling

Three settings cover the visible branding of the portal:

- `appName` — sets `document.title` and the top-bar wordmark
- `logoUrl` — when set, replaces the wordmark with an `<img>`
- `faviconUrl` — overrides the bundled `favicon.svg`

They can be configured at build time or injected at runtime; both paths are supported simultaneously, so you can ship a default branding in the bundle and override it per-host.

## Running in Production

Build the static bundle:

```bash
pnpm admin build
```

This emits `apps/admin/dist/`, which any static host (Cloudflare Pages, S3, Vercel, Netlify, Nginx) can serve. If you serve it from a sub-path, set `VITE_BASE_PATH` accordingly at build time, or set `basePath` on `window.__AUTHHERO_ADMIN_CONFIG__` at runtime.

## Deploying to Cloudflare Pages

Cloudflare Pages is the recommended host. In the Cloudflare dashboard, **Workers & Pages → Create → Pages → Connect to Git**, then:

| Setting | Value |
| --- | --- |
| Build command | `pnpm install --no-frozen-lockfile && pnpm --filter "@authhero/admin..." build` |
| Build output directory | `dist` |
| Root directory (advanced) | `apps/admin` |
| Environment variables | `NODE_VERSION=20`, `ENABLE_EXPERIMENTAL_COREPACK=1`, plus the `VITE_*` settings from the table above |

The trailing `...` on the pnpm filter is required — it builds admin's workspace dependencies (notably `@authhero/adapter-interfaces`) in topological order before admin itself. Without it, vite fails to resolve `@authhero/adapter-interfaces` because the symlinked workspace package has no built `dist/`.

For SPA client-side routing, add `apps/admin/public/_redirects`:

```
/*    /index.html   200
```

### Deploying to multiple Cloudflare accounts

Cloudflare's Git integration binds a repo to a single Cloudflare account. For multi-account deployments:

1. **GitHub Actions + Wrangler** — disconnect the Pages Git integration and deploy from CI with `cloudflare/wrangler-action`, supplying each account's `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as separate GitHub secrets. Build once, deploy N times via a matrix job. Per-account `VITE_*` values can be set as workflow env at build time, or use the runtime `window.__AUTHHERO_ADMIN_CONFIG__` to ship a single artifact.

2. **Fork per environment** — fork the repo into each Cloudflare account's organisation and connect each fork's Pages project to its own fork. The simpler workaround, at the cost of keeping forks in sync (typically via a scheduled `git push` from upstream).
