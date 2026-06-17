# Website deployment

The marketing site (`apps/website`) is deployed to **Cloudflare Pages** via GitHub Actions on every push to `main` that touches `apps/website/**`.

The workflow lives at [.github/workflows/deploy-website.yml](../../.github/workflows/deploy-website.yml). It builds `pnpm --filter @authhero/website build` and pushes `apps/website/dist` to the `authhero-website` Pages project. The deploy step runs from `apps/website` so wrangler also bundles the [`functions/`](./functions) directory (the early-access Pages Function).

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

`CLOUDFLARE_ACCOUNT_ID` is a variable (not a secret) so the workflow's `if:` condition can read it — that's what makes the workflow skip cleanly on forks that haven't configured deployment. (The same repo variable is shared with the docs deploy.)

### 3. First deploy

Push a change under `apps/website/**` (or trigger the workflow manually via **Actions → Deploy website → Run workflow**). On the first run, `wrangler pages deploy` will auto-create the `authhero-website` project.

### 4. Slack webhook secret

The early-access dialog forwards signups to Slack via the `functions/api/early-access` Function, which reads `SLACK_WEBHOOK_URL`. Set it once on the Pages project:

```bash
npx -y wrangler@4 pages secret put SLACK_WEBHOOK_URL --project-name authhero-website
```

(or under **Workers & Pages → authhero-website → Settings → Variables and Secrets**).

### 5. Custom domain

After the first successful deploy:

1. Go to **Cloudflare dashboard → Workers & Pages → authhero-website → Custom domains**
2. Add the domain you want (for example `authhero.net` / `www.authhero.net`)
3. If `authhero.net` is on Cloudflare DNS, the record is added automatically. Otherwise, add the CNAME shown by Cloudflare at your DNS provider.

## Local deploys

You can deploy from your machine without going through CI — useful for previews before merging to `main`.

1. Copy [`.env.example`](.env.example) to `.env` (git-ignored). It sets `CLOUDFLARE_ACCOUNT_ID`, which wrangler auto-loads to pick the target Cloudflare account. Add `CLOUDFLARE_API_TOKEN` too, or run `npx wrangler login` once.
2. From `apps/website`:

   ```bash
   pnpm deploy          # build + deploy → authhero-website, --branch=main (production)
   pnpm deploy:preview  # build + deploy → a preview deployment with its own URL
   ```

The `deploy` scripts use `npx -y wrangler@4` (same as CI), so there's nothing to install. Running from `apps/website` ensures the `functions/` directory is included.

## Fork behavior

Forks without `CLOUDFLARE_ACCOUNT_ID` configured will see the deploy job skipped (not failed). Forks that want to deploy their own copy follow the steps above with their own Cloudflare account and a different `--project-name`.
