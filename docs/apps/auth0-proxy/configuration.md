# Auth0 Proxy Configuration

## Environment Variables

The Auth0 Proxy requires the following environment variables to be set:

- `AUTH0_DOMAIN`: Your Auth0 domain (e.g., `your-tenant.auth0.com`)
- `API_KEY`: Your Auth0 Management API key token
- `API_KEY2`: (Optional) Additional part of the API key if it's too long for a single environment variable

## Setting Up Environment Variables

Create a `.env` file in the auth0-proxy directory with the following content:

```
AUTH0_DOMAIN=your-tenant.auth0.com
API_KEY=your-api-key-here
# API_KEY2=rest-of-key-if-needed
```

## Getting Auth0 Credentials

1. Log in to your Auth0 dashboard
2. Navigate to Applications > APIs > Auth0 Management API > API Explorer
3. Copy the token provided

**Note**: The env variables truncate after 4096 characters. If your token is longer, split it between `API_KEY` and `API_KEY2` variables.

## Custom Configuration

[Any additional configuration options will be documented here]