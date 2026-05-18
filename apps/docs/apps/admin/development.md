---
title: Admin Development
description: Development guide for the AuthHero Admin Dashboard — project structure, dual-router model, data and auth providers, building and testing.
---

# Admin Dashboard Development

## Stack

- **Vite** for dev server and bundling
- **React 19** with **TypeScript**
- **shadcn/ui** components on **Tailwind v4**
- **`ra-core`** — the headless half of react-admin — for resources, list/edit/create/show, data and auth providers
- **`@auth0/auth0-spa-js`** for the admin user's own login

## Project Structure

```
apps/admin/
├── public/
│   └── favicon.svg            # default bundled favicon
├── src/
│   ├── index.tsx              # outer router + branding boot
│   ├── App.tsx                # inner react-admin Router
│   ├── TenantsApp.tsx         # tenant-management UI
│   ├── AuthCallback.tsx       # OAuth callback handler
│   ├── authProvider.ts        # auth0-spa-js wrapper for ra-core
│   ├── auth0DataProvider.ts   # management API data provider
│   ├── components/            # shadcn-based UI components
│   ├── layout/                # app layout shell
│   ├── resources/             # one folder per ra-core resource
│   ├── utils/
│   │   └── runtimeConfig.ts   # env + window config + applyBranding()
│   └── styles/globals.css
├── index.html
├── vite.config.ts
└── package.json
```

## Dual-router model

The admin runs **two routers stacked**, both `BrowserRouter`:

- **Outer router** in `src/index.tsx`:
  - `/` → domain selection (or redirect to `/tenants` when `VITE_AUTH0_DOMAIN` is preconfigured)
  - `/auth-callback` → OAuth code exchange
  - `/tenants/*` → tenant management UI (`TenantsApp`)
  - `/:tenantId/*` → per-tenant admin (`App`) mounted with `basename="/:tenantId"`
- **Inner router** in `src/App.tsx`: the `ra-core` `<Router>` with resources scoped to a single tenant.

This is why every per-tenant link is naturally tenant-scoped — the inner router never has to know which tenant it's mounted under.

## Configuration

All runtime/build-time configuration flows through [`src/utils/runtimeConfig.ts`](https://github.com/markusahlstrand/authhero/blob/main/apps/admin/src/utils/runtimeConfig.ts). See [Installation](./installation.md#all-settings) for the full list.

`applyBranding()` is called once at boot from `src/index.tsx` and applies `appName` (→ `document.title`) and `faviconUrl` (→ `<link id="app-favicon">`). The top-bar logo/wordmark is rendered by [`src/components/admin/layout.tsx`](https://github.com/markusahlstrand/authhero/blob/main/apps/admin/src/components/admin/layout.tsx).

## Development Workflow

```bash
pnpm admin dev          # start dev server on :5173
pnpm admin type-check   # tsc --noEmit
pnpm admin test         # vitest
pnpm admin lint
pnpm admin format
```

## Building for Production

```bash
pnpm admin build
```

Output lands in `apps/admin/dist/` and can be served from any static host. The bundle uses `base: "./"` so it works from any sub-path; pair it with `VITE_BASE_PATH` (build-time) or `basePath` on `window.__AUTHHERO_ADMIN_CONFIG__` (runtime) when mounting under a path like `/admin`.

## Testing

```bash
pnpm admin test
```

Tests run in `jsdom` via Vitest. The test environment presets `VITE_AUTH0_API_URL` and `VITE_AUTH0_DOMAIN` to local stubs — see `vite.config.ts`.
