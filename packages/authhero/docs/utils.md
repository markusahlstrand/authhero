# Utils

The AuthHero package provides several utility functions to help with common tasks in authentication and web application development. These utilities are organized into two main categories: helpers and utils.

## Helpers

Helper functions are located in `src/helpers/` and provide high-level functionality for specific use cases.

### waitUntil

The `waitUntil` function is a critical utility for handling asynchronous operations that need to complete even after a response has been sent to the client.

```typescript
import { waitUntil } from "@authhero/authhero";

waitUntil(ctx, someAsyncOperation());
```

#### Purpose

This function is used to ensure that fire-and-forget calls are executed before the process shuts down. It's particularly useful for:

- Logging operations that should complete after sending a response
- Analytics tracking
- Background data processing
- Cleanup operations

#### Environment Handling

The `waitUntil` function intelligently handles different runtime environments:

- **Cloudflare Workers**: Uses the native `ctx.executionCtx.waitUntil()` method to ensure the promise completes before the worker terminates
- **Other environments**: Gracefully handles environments that don't support the waitUntil pattern

#### Usage Example

```typescript
import { Context } from "hono";
import { waitUntil } from "@authhero/authhero";

export async function loginHandler(ctx: Context) {
  // Handle the login logic
  const result = await processLogin(ctx);

  // Send response immediately
  const response = ctx.json({ success: true });

  // Log the activity asynchronously - this will complete even after response is sent
  waitUntil(
    ctx,
    ctx.env.data.logs.create(tenantId, {
      type: "login",
      user_id: result.userId,
      // ... other log data
    }),
  );

  return response;
}
```

#### Technical Details

The function uses Hono's `getRuntimeKey()` to detect the runtime environment:

- When running in Cloudflare Workers (`workerd` runtime), it leverages the execution context's `waitUntil` method
- In other environments, the function exists but doesn't perform any special handling

This ensures your code remains portable across different deployment environments while taking advantage of platform-specific optimizations when available.

## Other Helper Functions

The `src/helpers/` directory contains additional helper functions for:

- `cache-wrapper.ts` - Caching utilities
- `client.ts` - Client management helpers
- `data.ts` - Data manipulation utilities
- `saml.ts` - SAML protocol helpers
- `scopes-permissions.ts` - Authorization scope handling
- `server-timing.ts` - Performance timing utilities
- `service-token.ts` - Service token management
- `users.ts` - User-related helper functions

## Utils

The `src/utils/` directory contains lower-level utility functions for:

- **Authentication**: JWT handling (`jwks.ts`), password utilities (`password.ts`), OTP generation (`otp.ts`)
- **Security**: Encryption (`encryption.ts`), safe comparison (`safe-compare.ts`), crypto utilities (`crypto.ts`)
- **Data Processing**: Deep merging (`deep-merge.ts`), sorting (`sort.ts`)
- **Web**: Cookie handling (`cookies.ts`), URL validation (`is-valid-redirect-url.ts`), IP utilities (`ip.ts`)
- **Identifiers**: User ID generation (`user-id.ts`), organization ID handling (`organization-id.ts`), entity ID utilities (`entity-id.ts`)

These utilities are primarily used internally by the AuthHero package but may be useful for custom implementations and extensions.
