# Auth0 Proxy Configuration

The Auth0 Proxy can be configured using environment variables (recommended) or request headers (alternative).

## Configuration Methods

### 1. Environment Variables (Primary Method)

The Auth0 Proxy uses the following environment variables:

- `AUTH0_DOMAIN`: Your Auth0 domain URL (e.g., `https://your-tenant.auth0.com`)
- `API_KEY`: Your Auth0 Management API key token
- `API_KEY2`: (Optional) Additional part of the API key if it's too long for a single environment variable

#### Setting Up Environment Variables

Create a `.env` file in the auth0-proxy directory with the following content:

```
AUTH0_DOMAIN=https://your-tenant.auth0.com
API_KEY=your-api-key-here
# API_KEY2=rest-of-key-if-needed
```

**Note**: Environment variables truncate after 4096 characters. If your token is longer, split it between `API_KEY` and `API_KEY2` variables.

### 2. Request Headers (Fallback Method)

If environment variables are not set, the proxy will look for these HTTP headers in incoming requests:

- `x-auth0-domain`: Your Auth0 domain URL
- `authorization`: Your authorization token (typically in the format `Bearer YOUR_TOKEN`)

**Note**: The public deployment at **https://proxy.authhe.ro** has no environment variables configured, so it always requires these headers.

- `authorization`: Your authorization token (typically in the format `Bearer YOUR_TOKEN`)

Example usage with curl:

```bash
curl http://localhost:3000/api/v2/users \
  -H "x-auth0-domain: https://your-tenant.auth0.com" \
  -H "authorization: Bearer YOUR_AUTH0_TOKEN"
```

## Configuration Priority

1. Environment variables are checked first and take precedence
2. Request headers are used as a fallback if environment variables are not available

## Getting Auth0 Credentials

1. Log in to your Auth0 dashboard
2. Navigate to Applications > APIs > Auth0 Management API > API Explorer
3. Copy the token provided
