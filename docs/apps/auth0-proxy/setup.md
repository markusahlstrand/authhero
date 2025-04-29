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

```bash
curl http://localhost:3000/api/v2/users
```

If properly configured, this should return a list of users from your Auth0 tenant.