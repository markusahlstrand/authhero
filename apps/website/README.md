# @authhero/website

The public AuthHero marketing/landing site. A static Vite + React + shadcn/ui
single-page app, deployed to **Cloudflare Pages**.

## Develop

```bash
pnpm --filter @authhero/website dev      # http://localhost:8080
```

## Build

```bash
pnpm --filter @authhero/website build    # outputs to dist/
pnpm --filter @authhero/website preview  # preview the production build
```

## Deploy to Cloudflare Pages

Deployed to the `authhero-website` Pages project, the same way as the docs site:
CI on push to `main`, plus flag-based `wrangler pages deploy` for local deploys.
See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full setup (API token, secrets,
custom domain).

```bash
# from apps/website, after copying .env.example to .env
pnpm deploy          # build + deploy → authhero-website (production)
pnpm deploy:preview  # build + deploy → a preview URL
```

The first deploy auto-creates the `authhero-website` project. Run the deploy
from `apps/website` so wrangler bundles the [`functions/`](./functions) directory
(the early-access endpoint) alongside `dist`.

### SPA routing

The app uses client-side routing (react-router). [`public/_redirects`](./public/_redirects)
serves `index.html` for unknown paths so deep links (`/migration`, `/deploy`,
`/blog`) resolve correctly.

## Early-access signups (Slack)

The "Get Started" buttons open a dialog that posts an email to the
[`functions/api/early-access.ts`](./functions/api/early-access.ts) Cloudflare
Pages Function, which forwards it to Slack via an [Incoming Webhook](https://api.slack.com/messaging/webhooks).
The webhook URL is a server-side secret and never reaches the browser.

Set the secret on the Pages project (one time):

```bash
# Production (Pages project must exist — deploy once first)
wrangler pages secret put SLACK_WEBHOOK_URL --project-name authhero-website
```

For local testing with `wrangler pages dev` (which runs the Function), create an
untracked `.dev.vars` file:

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
```

```bash
pnpm --filter @authhero/website build
wrangler pages dev dist        # serves the app + /api/early-access locally
```

> The plain `vite dev` server does not run Pages Functions, so the dialog's
> submit only works under `wrangler pages dev` or on a deployed Pages site.

## Origin

Bootstrapped from a [Lovable](https://lovable.dev) project
(`markusahlstrand/auth-sovereign-engine`); the Lovable-specific tooling
(`lovable-tagger`, bun lockfiles) has been removed and the package wired into
this pnpm monorepo.
