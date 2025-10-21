# AuthHero Configuration

This document describes how to configure the AuthHero package for your application.

## Configuration Options

When initializing the AuthHero instance, you can provide a configuration object with the following options:

```typescript
import { init, AuthHeroConfig } from "@authhero/authhero";

const config: AuthHeroConfig = {
  dataAdapter: adapter, // Required
  allowedOrigins: ["https://example.com"], // Optional
  samlSigner: new HttpSamlSigner("https://signing-service.com/sign"), // Optional
  hooks: {
    // Optional hooks
  },
};

const { app } = init(config);
```

## Core Configuration

### `dataAdapter` (required)

The database adapter to use. AuthHero supports multiple adapters:

- [Kysely Adapter](../adapters/kysely.md)
- [Drizzle Adapter](../adapters/drizzle.md)
- [Cloudflare Adapter](../adapters/cloudflare.md)

```typescript
import { createKyselyAdapter } from "@authhero/kysely";

const config: AuthHeroConfig = {
  dataAdapter: createKyselyAdapter(db),
};
```

### `allowedOrigins` (optional)

An array of allowed origins for CORS. This is useful for restricting which domains can access your authentication endpoints.

```typescript
const config: AuthHeroConfig = {
  dataAdapter: adapter,
  allowedOrigins: ["https://app.example.com", "https://example.com"],
};
```

### `samlSigner` (optional)

A SAML signer instance for signing SAML responses. This is required if you need SAML authentication support.

```typescript
import { HttpSamlSigner } from "authhero";

const config: AuthHeroConfig = {
  dataAdapter: adapter,
  samlSigner: new HttpSamlSigner("https://signing-service.com/sign"),
};
```

For detailed SAML configuration options, see the [SAML Package Documentation](../saml/).

## Hooks Configuration

Hooks allow you to customize authentication logic at various points in the authentication flow. All hooks are optional.

::: tip
For detailed documentation about hooks, including Auth0 compatibility, URL/Form hooks, and complete API reference, see the [Hooks Documentation](../../auth0-comparison/hooks.md).
:::

```typescript
const config: AuthHeroConfig = {
  dataAdapter: adapter,
  hooks: {
    onExecuteCredentialsExchange: async (event, api) => {
      // Customize token claims or deny access
    },
    onExecutePreUserRegistration: async (event, api) => {
      // Validate or modify user data before registration
    },
    onExecutePostUserRegistration: async (event, api) => {
      // Perform actions after user registration
    },
    onExecutePreUserUpdate: async (event, api) => {
      // Validate or modify user data before update
    },
    onExecutePreUserDeletion: async (event, api) => {
      // Validate or cancel user deletion
    },
    onExecutePostUserDeletion: async (event, api) => {
      // Cleanup after user deletion
    },
    onExecutePostLogin: async (event, api) => {
      // Perform actions after successful login
    },
  },
};
```

### Quick Hook Examples

#### `onExecuteCredentialsExchange` - Customize token claims

```typescript
onExecuteCredentialsExchange: async (event, api) => {
  api.accessToken.setCustomClaim("roles", ["admin", "user"]);
  api.idToken.setCustomClaim("organization", "acme-corp");
};
```

#### `onExecutePreUserRegistration` - Set initial metadata

```typescript
onExecutePreUserRegistration: async (event, api) => {
  api.user.setUserMetadata("signup_source", "web");
};
```

#### `onExecutePostLogin` - Custom redirects

```typescript
onExecutePostLogin: async (event, api) => {
  api.redirect.sendUserTo("https://example.com/welcome", {
    query: { user_id: event.user?.user_id },
  });
};
```

For complete hook documentation including all event data, API methods, and advanced use cases, see the [Hooks Documentation](../../auth0-comparison/hooks.md).

## Environment Variables (Bindings)

When deploying AuthHero, additional configuration is provided through environment variables (bindings). These are typically set in your deployment environment (e.g., Cloudflare Workers, Docker, etc.):

### Required Environment Variables

- `AUTH_URL`: The base URL for authentication endpoints
- `ISSUER`: The issuer identifier for JWT tokens
- `JWKS_CACHE_TIMEOUT_IN_SECONDS`: Cache timeout for JWKS keys
- `ORGANIZATION_NAME`: Organization name used in certificates

### Optional Environment Variables

- `SAML_SIGN_URL`: URL for the SAML signing service (used if `samlSigner` not provided in config)
- `JWKS_URL`: Custom JWKS endpoint URL
- `UNIVERSAL_LOGIN_URL`: Custom universal login page URL
- `OAUTH_API_URL`: Custom OAuth API URL
- `DEFAULT_TENANT_ID`: Default tenant to use
- `DEFAULT_CLIENT_ID`: Default client to use
- `ENVIRONMENT`: Environment name (e.g., "production", "development")

::: tip SAML Configuration Priority
If both `samlSigner` config option and `SAML_SIGN_URL` environment variable are set, the `samlSigner` config takes priority. See [SAML Configuration](../saml/configuration.md) for details.
:::

### Email Provider Configuration

Configure email providers for sending authentication emails:

```typescript
// In your environment bindings
env.emailProviders = {
  sqs: sendSqsEmail,
  sendgrid: sendSendGridEmail,
};
```

Email providers must implement the `EmailService` interface:

```typescript
type EmailService = (params: {
  emailProvider: EmailProvider;
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  template: string;
  data: Record<string, string>;
}) => Promise<{}>;
```

### SMS Provider Configuration

Configure SMS providers for sending authentication codes:

```typescript
// In your environment bindings
env.smsProviders = {
  twilio: sendTwilioSms,
  vonage: sendVonageSms,
};
```

SMS providers must implement the `smsService` interface:

```typescript
type smsService = (params: {
  to: string;
  from?: string;
  text: string;
  template: string;
  options: any;
  data: Record<string, string>;
}) => Promise<{}>;
```

## Branding Configuration

Branding is configured per-tenant through the Management API, not through the config object. The branding configuration includes:

### Logo and Favicon

```typescript
{
  logo_url: "https://example.com/logo.png",
  favicon_url: "https://example.com/favicon.ico",
  powered_by_logo_url: "https://example.com/powered-by.png", // Optional
}
```

::: info
The `powered_by_logo_url` field is available in the API. When set, it displays a "powered by" logo in the footer of authentication pages. The logo appears with reduced opacity and increases on hover.
:::

### Colors

```typescript
{
  colors: {
    primary: "#0066cc",
    page_background: {
      type: "gradient",
      start: "#ffffff",
      end: "#f0f0f0",
      angle_deg: 45
    }
  }
}
```

### Custom Fonts

```typescript
{
  font: {
    url: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap";
  }
}
```

## Complete Example

Here's a complete example showing all configuration options:

```typescript
import { init, AuthHeroConfig } from "@authhero/authhero";
import { createKyselyAdapter } from "@authhero/kysely";

const config: AuthHeroConfig = {
  // Required: Database adapter
  dataAdapter: createKyselyAdapter(db),

  // Optional: CORS configuration
  allowedOrigins: ["https://app.example.com", "https://example.com"],

  // Optional: Hooks for custom logic
  hooks: {
    onExecuteCredentialsExchange: async (event, api) => {
      // Add custom claims based on user properties
      if (event.user?.app_metadata?.role) {
        api.accessToken.setCustomClaim("role", event.user.app_metadata.role);
      }

      // Add organization info
      if (event.organization) {
        api.idToken.setCustomClaim("org_id", event.organization.id);
      }
    },

    onExecutePreUserRegistration: async (event, api) => {
      // Set default user metadata
      api.user.setUserMetadata("created_via", "signup_form");
      api.user.setUserMetadata("terms_accepted", true);
    },

    onExecutePostUserRegistration: async (event, api) => {
      // Log registration for analytics
      console.log(`User registered: ${event.user?.email}`);
    },

    onExecutePreUserUpdate: async (event, api) => {
      // Track update timestamp
      api.user.setUserMetadata("updated_at", new Date().toISOString());
    },

    onExecutePostLogin: async (event, api) => {
      // Check if MFA is required
      if (
        event.user?.app_metadata?.require_mfa &&
        !event.authentication?.methods.find((m) => m.name === "mfa")
      ) {
        api.prompt.render("mfa-challenge");
      }
    },
  },
};

// Initialize AuthHero
const { app, managementApp, oauthApp, universalApp } = init(config);

// Export for your deployment platform
export default app;
```

## Additional Resources

- [Hooks Documentation](../../auth0-comparison/hooks.md) - Complete guide to hooks including Auth0 compatibility
- [Kysely Adapter](../adapters/kysely.md)
- [Drizzle Adapter](../adapters/drizzle.md)
- [Cloudflare Adapter](../adapters/cloudflare.md)
