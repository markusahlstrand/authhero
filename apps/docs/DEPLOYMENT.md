# Docs site deployment

The VitePress docs site (`apps/docs`) is deployed to **Cloudflare Pages** via GitHub Actions on every push to `main` that touches `apps/docs/**`.

The workflow lives at [.github/workflows/deploy-docs.yml](../../.github/workflows/deploy-docs.yml). It builds `pnpm --filter @authhero/docs build` and pushes `apps/docs/.vitepress/dist` to the `authhero-docs` Pages project, which is served at [docs.authhero.net](https://docs.authhero.net).

## One-time setup

These steps only need to be done once per fork that wants to deploy its own copy.

### 1. Cloudflare API token

Create a token at [dash.cloudflare.com → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) with:

- **Account → Cloudflare Pages → Edit** (or **Workers Scripts → Edit** on newer accounts — both work)
- **Account Resources**: scoped to the specific account that owns the Pages project

### 2. Repo configuration

In the GitHub repo, go to **Settings → Secrets and variables → Actions**:

- **Secrets** tab → add `CLOUDFLARE_API_TOKEN` (the token from step 1)
- **Variables** tab → add `CLOUDFLARE_ACCOUNT_ID` (visible in the right sidebar of any Cloudflare dashboard page)

`CLOUDFLARE_ACCOUNT_ID` is a variable (not a secret) so the workflow's `if:` condition can read it — that's what makes the workflow skip cleanly on forks that haven't configured deployment.

### 3. First deploy

Push a change under `apps/docs/**` (or trigger the workflow manually via **Actions → Deploy docs → Run workflow**). On the first run, `wrangler pages deploy` will auto-create the `authhero-docs` project.

### 4. Custom domain

After the first successful deploy:

1. Go to **Cloudflare dashboard → Workers & Pages → authhero-docs → Custom domains**
2. Add `docs.authhero.net`
3. If `authhero.net` is on Cloudflare DNS, the CNAME is added automatically. Otherwise, add the CNAME shown by Cloudflare at your DNS provider.

## Fork behavior

Forks without `CLOUDFLARE_ACCOUNT_ID` configured will see the deploy job skipped (not failed). Forks that want to deploy their own copy of the docs follow the steps above with their own Cloudflare account and a different `--project-name`.
