# AuthHero Configuration

This document describes how to configure the AuthHero package for your application.

## Configuration Options

When initializing the AuthHero instance, you can provide a configuration object with the following options:

```typescript
const config = {
  // Configuration options will be listed here
};

const authHero = new AuthHero(config);
```

### Core Configuration

- `adapter`: The database adapter to use (required)
- `domain`: The domain for your authentication endpoints (required)
- `jwtSecret`: Secret for signing JWT tokens (required)

### Advanced Configuration

- `tokenExpiration`: Configuration for token expiration times
- `customDomains`: Settings for custom domain support
- `emailProvider`: Configuration for email delivery

## Using Environment Variables

It's recommended to use environment variables for sensitive configuration options:

```typescript
const config = {
  jwtSecret: process.env.JWT_SECRET,
  // Other configuration options
};
```

## Adapter Configuration

Each adapter has its own configuration requirements. See the specific adapter documentation for details:

- [Kysely Adapter](../adapters/kysely.md)
- [Drizzle Adapter](../adapters/drizzle.md)
- [Cloudflare Adapter](../adapters/cloudflare.md)