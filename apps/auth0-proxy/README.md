# Auth0 Proxy

This is a small proxy server that exposes the Auth0 Management API on a local port, intended for development and testing purposes.

## Overview

The Auth0 Proxy forwards requests to the Auth0 Management API, allowing you to:

- Access the Auth0 Management API locally
- Work with multiple Auth0 tenants through a single endpoint
- Use the AuthHero management portal to navigate the Auth0 Management API

## Public Deployment

A public instance of the Auth0 Proxy is deployed at **https://proxy.authhe.ro**. This deployment:

- Has no pre-configured environment variables
- Requires all configuration to be provided via request headers
- Is freely available for AuthHero users

To use the public proxy, include these headers in your requests:

```bash
curl https://proxy.authhe.ro/api/v2/users \
  -H "x-auth0-domain: https://your-tenant.auth0.com" \
  -H "authorization: Bearer YOUR_AUTH0_TOKEN"
```

## Configuration

You can configure the proxy in two ways:

### 1. Environment Variables (Recommended)

This is the primary configuration method:

- `AUTH0_DOMAIN`: The Auth0 domain URL (e.g., `https://your-tenant.auth0.com`)
- `API_KEY`: Your Auth0 Management API token
- `API_KEY2`: (Optional) Extension for API_KEY if it exceeds environment variable length limits

**Note:** If your API token is longer than 4096 characters (environment variable limit), split it between `API_KEY` and `API_KEY2`.

### 2. Request Headers (Fallback)

If environment variables aren't set, the proxy falls back to these request headers:

- `x-auth0-domain`: The Auth0 domain URL
- `authorization`: Authorization header (typically `Bearer YOUR_TOKEN`)

## Priority Order

1. Environment variables take precedence if available
2. Request headers are used as a fallback if environment variables aren't set

## Usage

### Starting the Proxy

Run the following command to start the proxy:

```bash
pnpm proxy dev
```

The proxy will be available on `http://localhost:3000`.

### Making Requests

All requests to `http://localhost:3000/api/*` will be forwarded to the configured Auth0 domain with the appropriate authorization.

Example request:

```bash
curl http://localhost:3000/api/v2/users \
  -H "x-auth0-domain: https://your-tenant.auth0.com" \
  -H "authorization: Bearer YOUR_AUTH0_TOKEN"
```

### Using with AuthHero

You can now use the AuthHero management portal to navigate the Auth0 Management API by pointing it to the proxy endpoint.

## Cloudflare Workers Deployment

The Auth0 Proxy can be deployed to Cloudflare Workers to make it accessible at proxy.authhe.ro.

### Prerequisites

- Cloudflare account with Workers subscription
- Wrangler CLI installed (`npm install -g wrangler` or included in devDependencies)
- Cloudflare domain configured for proxy.authhe.ro

### Manual Deployment

1. Login to your Cloudflare account:

```bash
npx wrangler login
```

2. Set your API_KEY as a secret (never store sensitive keys in wrangler.toml):

```bash
pnpm run secret:set
# Follow the prompts to enter your API key
```

3. If you have a long API key, set the second part:

```bash
pnpm run secret:set:api-key2
# Follow the prompts to enter the remainder of your API key
```

4. Deploy to staging environment:

```bash
pnpm run deploy:staging
```

5. Once tested, deploy to production:

```bash
pnpm run deploy
```

### Automated Deployment with GitHub Actions

This repository includes a GitHub Actions workflow that automatically deploys the proxy to Cloudflare Workers:

- **Push to main branch**: Automatically deploys to staging environment
- **Manual trigger**: Allows you to choose between staging and production

#### GitHub Secrets Required

Add these secrets to your GitHub repository:

- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token with Workers permissions
- `AUTH0_DOMAIN`: Your Auth0 domain URL
- `API_KEY`: Your Auth0 Management API token (first part)
- `API_KEY2`: Second part of your API token if needed

#### Helper Script

You can also use the included deploy script:

```bash
# Deploy to staging
./deploy.sh staging

# Deploy to production
./deploy.sh
```

### Environments

- **Production**: proxy.authhe.ro (deployed without environment variables, requires headers)
- **Staging**: proxy-staging.authhe.ro
- **Local**: http://localhost:8787 (via `pnpm run dev:wrangler`)

### Monitoring

View logs from your deployed worker:

```bash
pnpm run logs
```
