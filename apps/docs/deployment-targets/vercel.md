# Vercel Deployment

Vercel can be used to deploy the AuthHero React Admin interface. **Note:** Currently, only the React Admin application is supported for Vercel deployment, not the core authentication server.

## Quick Deploy

The easiest way to deploy React Admin to Vercel is using the deploy button:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fauthhero%2Fauthhero&env=VITE_AUTH0_DOMAIN,VITE_AUTH0_CLIENT_ID,VITE_AUTH0_API_URL,VITE_SINGLE_DOMAIN_MODE&envDescription=Configure%20your%20AuthHero%20connection.%20Set%20VITE_SINGLE_DOMAIN_MODE%20to%20%22true%22%20to%20skip%20domain%20selector.&envLink=https%3A%2F%2Fgithub.com%2Fauthhero%2Fauthhero%2Fblob%2Fmain%2Fapps%2Freact-admin%2FREADME.md&project-name=authhero-admin&repository-name=authhero-admin&root-directory=apps%2Freact-admin&build-command=pnpm%20run%20build&output-directory=dist&install-command=corepack%20enable%20%26%26%20corepack%20prepare%20pnpm%4010.11.0%20--activate%20%26%26%20pnpm%20install%20--no-frozen-lockfile)

Or deploy to Cloudflare Pages:

[![Deploy to Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/authhero/authhero)

::: details Cloudflare Pages Setup
During setup:

1. Select **Pages** as the deployment type
2. Set **Root directory** to `apps/react-admin`
3. Set **Build command** to `pnpm run build`
4. Set **Build output directory** to `dist`
5. Add environment variables:
   - `VITE_AUTH0_DOMAIN` - Your AuthHero domain
   - `VITE_AUTH0_CLIENT_ID` - Client ID (usually `auth-admin`)
   - `VITE_AUTH0_API_URL` - Your AuthHero API URL
   - `VITE_SINGLE_DOMAIN_MODE` - Set to `true` to skip domain selector
     :::

This will:

- Clone the repository to your GitHub account
- Set up the project with the correct root directory (`apps/react-admin`)
- Configure the build commands with proper pnpm compatibility
- Prompt you for the required environment variables

## React Admin Deployment

The React Admin interface is a Vite-based single-page application that can be deployed to Vercel.

### Prerequisites

- A Vercel account
- A GitHub, GitLab, or Bitbucket repository containing your AuthHero fork

### Deployment Steps

1. **Connect Repository to Vercel**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New Project"
   - Import your repository

2. **Configure Project Settings**
   - Set the **Root Directory** to: `apps/react-admin`
   - Set the **Framework Preset** to: `Vite`
   - The Build Command should auto-detect as: `pnpm run build`
   - The Output Directory should auto-detect as: `dist`

3. **Set Environment Variables**

   Required environment variables in Vercel:

   ```bash
   # Enable corepack for pnpm compatibility
   ENABLE_EXPERIMENTAL_COREPACK=1

   # AuthHero configuration
   VITE_AUTH0_DOMAIN=your-authhero-domain.com
   VITE_AUTH0_CLIENT_ID=auth-admin
   VITE_AUTH0_API_URL=https://your-authhero-api.com

   # Optional: Skip domain selector and use configured domain directly
   VITE_SINGLE_DOMAIN_MODE=true
   ```

   ::: warning Important
   You **must** set `ENABLE_EXPERIMENTAL_COREPACK=1` as an environment variable in Vercel to avoid build errors with pnpm 10.x and Node.js 22.
   :::

   ::: tip Single Domain Mode
   Set `VITE_SINGLE_DOMAIN_MODE=true` to skip the domain selector entirely and use the configured `VITE_AUTH0_DOMAIN` automatically. This is recommended for deployments that only need to connect to a single AuthHero instance.
   :::

4. **Deploy**
   - Click "Deploy"
   - Vercel will automatically build and deploy your application

### Configuration Files

The project includes a `vercel.json` file with the necessary configuration:

```json
{
  "rewrites": [
    {
      "source": "/(.*)manifest.json",
      "destination": "/manifest.json"
    },
    {
      "source": "/favicon.ico",
      "destination": "/favicon.ico"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "installCommand": "corepack enable && corepack prepare pnpm@10.11.0 --activate && pnpm install --no-frozen-lockfile"
}
```

### Troubleshooting

#### Build Fails with ERR_INVALID_THIS

If you see errors like:

```
ERR_PNPM_META_FETCH_FAIL  GET https://registry.npmjs.org/...
Value of "this" must be of type URLSearchParams
```

**Solution:** Add the `ENABLE_EXPERIMENTAL_COREPACK=1` environment variable in your Vercel project settings under **Settings → Environment Variables**.

This error occurs due to a compatibility issue between certain pnpm versions and Vercel's build environment. Enabling experimental corepack resolves the issue.

#### Domain Selection

The React Admin app supports multiple domains through a domain selector UI. Users can:

- Add domains via the UI
- Store domain configurations in browser cookies
- Switch between different AuthHero instances

If you set `VITE_AUTH0_DOMAIN` and related variables, that domain will be pre-configured as the default.

### Custom Domain

To add a custom domain:

1. Go to your Vercel project settings
2. Navigate to **Domains**
3. Add your custom domain
4. Follow Vercel's DNS configuration instructions

### Automatic Deployments

Vercel automatically deploys:

- **Production deployments** from your main/master branch
- **Preview deployments** from pull requests and other branches

## Limitations

- **Only React Admin** can be deployed to Vercel with this setup
- The core AuthHero authentication server requires a different deployment target (Cloudflare Workers, AWS, or VPS)
- React Admin needs to connect to an AuthHero API server deployed elsewhere

## Alternative: Full Stack on Vercel

While the current setup only supports React Admin, you could potentially deploy the full AuthHero stack to Vercel using:

- **Vercel Serverless Functions** for the API
- **Vercel Postgres** or **Vercel KV** for storage

This would require creating a custom Vercel adapter for AuthHero, which is not currently available.

## Next Steps

- Review [React Admin documentation](../apps/react-admin/) for app-specific configuration
- Set up your AuthHero API server on a [supported platform](./index)
- Configure authentication between React Admin and your API server
