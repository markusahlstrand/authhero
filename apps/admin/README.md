# @authhero/admin

The AuthHero admin UI — a Vite + React 19 SPA for managing tenants, users, applications, connections, roles, branding and more across one or many AuthHero deployments.

Built on `ra-core` (the headless half of react-admin) with [shadcn/ui](https://ui.shadcn.com/) and Tailwind v4.

## Quick start

```bash
# from the repo root
pnpm install
pnpm admin dev        # starts on http://localhost:5173

# or from this directory
pnpm dev
pnpm build            # production bundle in ./dist
pnpm type-check
pnpm test
```

## Configuration

The admin reads its configuration from two sources, in priority order:

1. **Runtime config** — `window.__AUTHHERO_ADMIN_CONFIG__` (injected by the host page before the bundle loads). Useful when the same static build is served to multiple environments.
2. **Build-time env vars** — `VITE_*` variables baked in at `pnpm build` time.

Both paths share the same keys, defined in [`src/utils/runtimeConfig.ts`](src/utils/runtimeConfig.ts).

### Settings

| Setting | Env var | Runtime key | Default | Description |
| --- | --- | --- | --- | --- |
| Auth0 domain | `VITE_AUTH0_DOMAIN` | `domain` | — | Tenant domain used by `@auth0/auth0-spa-js` to log the admin user in. When unset, the user is prompted to pick a domain on first load. |
| Auth0 client ID | `VITE_AUTH0_CLIENT_ID` | `clientId` | — | SPA application client ID for the admin itself. |
| Management API URL | `VITE_AUTH0_API_URL` | `apiUrl` | — | Base URL of the AuthHero management API (e.g. `https://auth.example.com`). |
| Auth0 audience | `VITE_AUTH0_AUDIENCE` | `audience` | — | Audience requested for the management API access token. |
| Base path | `VITE_BASE_PATH` | `basePath` | `""` | Sub-path the admin is served from (e.g. `/admin`). Routes and the OAuth callback honor this. |
| App name | `VITE_APP_NAME` | `appName` | `"AuthHero Admin"` | Browser tab title and the wordmark shown in the top bar (when no logo is set). |
| Logo URL | `VITE_APP_LOGO_URL` | `logoUrl` | — | Image rendered in the top bar in place of the wordmark. Anything browsers can display (PNG, SVG, WebP). Recommended height: 28px. |
| Favicon URL | `VITE_APP_FAVICON_URL` | `faviconUrl` | `./favicon.svg` | Overrides the built-in favicon. |

### Build-time env example

Create `apps/admin/.env.local`:

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
<script type="module" src="/admin/assets/index-<hash>.js"></script>
```

The bundle entry filename is fingerprinted by Vite at build time (e.g. `index-Ab12Cd.js`), so substitute the real filename from your build output — or use `window.__AUTHHERO_ADMIN_CONFIG__.basePath` to construct it from the configured base path.

If neither source provides a `domain`, the admin shows a domain picker on first load and stores the choice in a cookie via [`src/utils/domainUtils.ts`](src/utils/domainUtils.ts).

## Whitelabeling

The three branding settings (`appName`, `logoUrl`, `faviconUrl`) are read in three places:

- `document.title` and the favicon `<link>` are set on boot by `applyBranding()` in [`src/utils/runtimeConfig.ts`](src/utils/runtimeConfig.ts).
- The top bar in [`src/components/admin/layout.tsx`](src/components/admin/layout.tsx) renders `logoUrl` as an `<img>` when set, otherwise the `appName` wordmark (with two-letter initials as the narrow-width glyph).

To replace the default mark, set `VITE_APP_FAVICON_URL` to your own asset; the bundled default lives at [`public/favicon.svg`](public/favicon.svg).

## Deploying to Cloudflare Pages

The admin is a static SPA, so any static host works. Cloudflare Pages is the recommended target.

In the Cloudflare dashboard, **Workers & Pages → Create → Pages → Connect to Git**, then:

| Setting | Value |
| --- | --- |
| Build command | `pnpm install --no-frozen-lockfile && pnpm --filter "@authhero/admin..." build` |
| Build output directory | `dist` |
| Root directory (advanced) | `apps/admin` |
| Environment variables | `NODE_VERSION=20`, `ENABLE_EXPERIMENTAL_COREPACK=1`, plus the `VITE_*` settings from the table above |

The trailing `...` on the pnpm filter is required — it builds admin's workspace dependencies (notably `@authhero/adapter-interfaces`) before admin itself. Without it, vite fails to resolve `@authhero/adapter-interfaces` because the symlinked package has no built `dist/`.

For SPA client-side routing, add [`public/_redirects`](public/_redirects):

```text
/*    /index.html   200
```

### Multiple Cloudflare accounts

Cloudflare's Git integration binds a repo to a single Cloudflare account. To deploy the same codebase to several accounts, you have two options:

1. **GitHub Actions + Wrangler** — disconnect the Pages Git integration and deploy from CI with `cloudflare/wrangler-action`, supplying each account's `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as separate GitHub secrets. Build once, deploy N times via a matrix job. Per-account `VITE_*` values can be set as workflow env at build time, or use the runtime `window.__AUTHHERO_ADMIN_CONFIG__` to ship a single artifact.
2. **Fork per environment** — fork the repo into each Cloudflare account's organisation and connect each fork's Pages project to its own fork. Lower setup cost, at the price of having to merge changes upstream and keep forks in sync.

## Architecture notes

- **Dual router**: the outer router in [`src/index.tsx`](src/index.tsx) handles domain selection (`/`), tenant management (`/tenants/*`), per-tenant admin (`/:tenantId/*`) and the OAuth callback (`/auth-callback`). The inner router in [`src/App.tsx`](src/App.tsx) is the react-admin router mounted with `basename="/:tenantId"`.
- **Auth**: `@auth0/auth0-spa-js` against the configured `domain`/`clientId`/`audience`. The provider lives in [`src/authProvider.ts`](src/authProvider.ts).
- **Data**: a custom data provider in [`src/auth0DataProvider.ts`](src/auth0DataProvider.ts) talks to the AuthHero management API.

See the full docs at [authhero.net/apps/admin/](https://authhero.net/apps/admin/).
