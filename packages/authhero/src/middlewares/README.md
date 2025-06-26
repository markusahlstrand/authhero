# Client Info Middleware

The `clientInfoMiddleware` extracts client information from HTTP requests and stores it in Hono context variables for easy access throughout your application. **This middleware is automatically applied to all AuthHero routes** (Management API, Auth API, Universal Login, and SAML).

## Automatic Usage

The middleware is automatically applied to all routes, so client information is always available in your request handlers:

```typescript
// In any route handler
app.get("/some-route", async (c) => {
  const auth0Client = c.get("auth0_client");
  const ip = c.get("ip");
  const userAgent = c.get("useragent");
  const country = c.get("countryCode");

  console.log(`Request from ${country}: ${auth0Client?.name} v${auth0Client?.version}`);

  return c.json({ message: "Hello from " + country });
});
});
```

### What Information is Extracted

The middleware extracts the following information from requests:

- **auth0_client**: From query parameter `auth0Client` (parsed into structured object with name, version, and environment info)
- **ip**: From header `x-real-ip` (max 45 chars)
- **useragent**: From header `user-agent` (max 512 chars)
- **countryCode**: From header `cf-ipcountry` (2 chars, CloudFlare country code)

#### Auth0 Client Parsing

The `auth0Client` query parameter is parsed into a structured object:

```typescript
{
  name: string;           // e.g., "auth0-spa-js"
  version: string;        // e.g., "1.13.6"
  env?: {                 // Optional environment info
    node?: string;        // e.g., "16.14.0"
  };
}
```

Supported formats:

- `"auth0-spa-js/1.13.6"` → `{ name: "auth0-spa-js", version: "1.13.6" }`
- `"auth0-spa-js/1.13.6 (env: node/16.14.0)"` → `{ name: "auth0-spa-js", version: "1.13.6", env: { node: "16.14.0" } }`
- Base64 encoded versions of the above formats are also supported

## Utility Functions

For convenience, several utility functions are available:

```typescript
import {
  getClientInfoFromContext,
  getClientInfoWithStringAuth0Client,
  stringifyAuth0Client,
} from "../utils/client-info";

// Get structured client info
const clientInfo = getClientInfoFromContext(c);
console.log(clientInfo.auth0_client?.name); // "auth0-spa-js"

// Get client info with auth0Client as string (for backward compatibility)
const clientInfoString = getClientInfoWithStringAuth0Client(c);
console.log(clientInfoString.auth0Client); // "auth0-spa-js/1.13.6"

// Convert structured object to string
const auth0ClientString = stringifyAuth0Client(c.get("auth0_client"));
```

### Integration with Existing Code

The `getClientInfo` utility function has been updated to work with both the middleware approach and direct header extraction:

```typescript
import { getClientInfo } from "../utils/client-info";

// With middleware context
const clientInfo = getClientInfo(c.req, c.var);

// Without middleware (direct extraction)
const clientInfo = getClientInfo(c.req);
```

### Variables Type

The `Variables` type has been updated to include the client info fields:

```typescript
export type Variables = {
  // ... existing fields ...
  // Client info from middleware
  auth0_client?:
    | {
        name: string;
        version: string;
        env?:
          | {
              node?: string | undefined;
            }
          | undefined;
      }
    | undefined;
  useragent?: string;
  countryCode?: CountryCode;
};
```

Note: The `ip` field was already present in the Variables type.
