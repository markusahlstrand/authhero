# Auth0 Proxy Setup

## Prerequisites

- Node.js (version 16 or higher)
- npm, yarn, or pnpm package manager
- Auth0 account with Management API credentials

## Installation Steps

1. Clone the AuthHero repository or download the source code
2. Navigate to the auth0-proxy directory

```bash
cd apps/auth0-proxy
```

3. Install dependencies

```bash
pnpm install
```

## Running the Proxy

Start the proxy server:

```bash
pnpm dev
```

The proxy will be available on `http://localhost:3000` by default.

## Testing the Connection

You can verify that the proxy is working by making a request to it:

### Using Environment Variables

If you've set up the environment variables correctly:

```bash
curl http://localhost:3000/api/v2/users
```

### Using Request Headers

If you prefer to use request headers instead:

```bash
curl http://localhost:3000/api/v2/users \
  -H "x-auth0-domain: https://your-tenant.auth0.com" \
  -H "authorization: Bearer YOUR_AUTH0_TOKEN"
```

If properly configured, either method should return a list of users from your Auth0 tenant.

## Using the Public Deployment

If you don't want to run the proxy locally, you can use the public deployment at **https://proxy.authhe.ro**:

```bash
curl https://proxy.authhe.ro/api/v2/users \
  -H "x-auth0-domain: https://your-tenant.auth0.com" \
  -H "authorization: Bearer YOUR_AUTH0_TOKEN"
```

The public deployment has no environment variables configured, so you must always include the `x-auth0-domain` and `authorization` headers with every request.
