# Social Authentication Strategies

This directory contains the social authentication strategy implementations and configurations for AuthHero.

## Overview

Social strategies provide OAuth-based authentication for third-party providers like Google, Facebook, Apple, etc. Each strategy implements the `Strategy` interface and includes:

1. **Authentication Methods**: `getRedirect()` and `validateAuthorizationCodeAndGetUser()`
2. **Display Configuration**: Name, display name, and SVG logo component
3. **Type Safety**: TypeScript types for all strategy configurations

## Strategy Interface

Each social strategy module exports:

```typescript
export type Strategy = {
  displayName: string; // Human-readable name (e.g., "Google")
  logo: FC<{ className?: string }>; // SVG logo component
  getRedirect: (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    connection: Connection,
  ) => Promise<{ redirectUrl: string; code: string; codeVerifier?: string }>;
  validateAuthorizationCodeAndGetUser: (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    connection: Connection,
    code: string,
    codeVerifier?: string,
  ) => Promise<UserInfo>;
};
```

Each strategy file exports:

- `displayName` - The display name for UI
- `logo` - The SVG logo component
- `getRedirect()` - Function to generate OAuth redirect URL
- `validateAuthorizationCodeAndGetUser()` - Function to validate code and get user info

## Available Strategies

### Fully Implemented

- **Google OAuth2** (`google-oauth2`) - Google authentication with PKCE
- **Facebook** (`facebook`) - Facebook authentication
- **Apple** (`apple`) - Apple Sign In with private key authentication
- **Vipps** (`vipps`) - Vipps authentication (Norwegian payment provider)
- **GitHub** (`github`) - GitHub OAuth authentication
- **Microsoft** (`microsoft`) - Microsoft Entra ID (Azure AD) authentication with PKCE

## Usage in Components

### Getting Strategy Configuration

```typescript
import { getSocialStrategy } from "../strategies";

// Get a single strategy
const googleStrategy = getSocialStrategy("google-oauth2");

// Get all available strategies for a client
const socialConnections = client.connections
  .map(({ strategy }) => {
    const strategyObj = getSocialStrategy(strategy);
    return strategyObj ? { name: strategy, ...strategyObj } : null;
  })
  .filter((config): config is NonNullable<typeof config> => config !== null);
```

### Rendering Social Login Buttons

```typescript
{socialConnections.map((config) => {
  const Logo = config.logo;
  return (
    <a
      key={config.name}
      href={`/authorize/redirect?state=${loginSession.id}&connection=${config.name}`}
    >
      <Logo className="h-5 w-5" />
      {config.displayName}
    </a>
  );
})}
```

## Adding a New Strategy

To add a new social authentication strategy:

1. **Create the strategy implementation** (e.g., `linkedin.ts`):

   ```typescript
   import { LinkedIn } from "arctic";
   import { Context } from "hono";
   import { Connection } from "@authhero/adapter-interfaces";
   import { nanoid } from "nanoid";
   import { Bindings, Variables } from "../types";
   import { getAuthUrl } from "../variables";
   import { LinkedInLogo } from "./social-strategies";

   export const displayName = "LinkedIn";
   export const logo = LinkedInLogo;

   export async function getRedirect(ctx, connection) {
     // Implementation
   }

   export async function validateAuthorizationCodeAndGetUser(
     ctx,
     connection,
     code,
   ) {
     // Implementation
   }
   ```

2. **Add the logo** to `social-strategies.tsx`:

   ```typescript
   export const LinkedInLogo: FC<{ className?: string }> = ({ className = "" }) => (
     <svg className={className}>
       {/* SVG path data */}
     </svg>
   );
   ```

3. **Register the strategy** in `index.ts`:

   ```typescript
   import * as linkedin from "./linkedin";

   export function getStrategy(ctx, name): Strategy {
     const strategies: Record<string, Strategy> = {
       // ... existing strategies
       linkedin,
       ...envStrategies,
     };
     // ...
   }

   export function getSocialStrategy(name: string): Strategy | undefined {
     const strategies: Record<string, Strategy> = {
       // ... existing strategies
       linkedin,
     };
     return strategies[name];
   }
   ```

That's it! The strategy is now fully integrated and will automatically appear in UI components.

## Logo Components

All logo components are exported from `social-strategies.tsx` and follow this signature:

```typescript
type LogoComponent = FC<{ className?: string }>;
```

This allows consumers to control the size and styling via className:

```typescript
<GoogleLogo className="h-6 w-6 text-blue-500" />
```

## Files

- **`index.ts`** - Main exports, strategy registry, and helper functions
- **`social-strategies.tsx`** - Social strategy type definitions and logo components
- **`google-oauth2.ts`** - Google OAuth implementation with PKCE
- **`facebook.ts`** - Facebook OAuth implementation
- **`apple.ts`** - Apple Sign In implementation with private key
- **`vipps.ts`** - Vipps authentication implementation
- **`github.ts`** - GitHub OAuth implementation
- **`microsoft.ts`** - Microsoft Entra ID implementation with PKCE
- **`saml.ts`** - SAML authentication implementation

## Strategy-Specific Implementation Notes

### GitHub Strategy

- Uses GitHub OAuth Apps
- Requires `client_id` and `client_secret` in connection options
- Default scope: `user:email`
- Fetches user profile and verified email addresses from GitHub API
- Returns user ID as string, name, email, and avatar URL

### Microsoft Strategy

- Uses Microsoft Entra ID (formerly Azure AD)
- Requires `client_id` and `client_secret` in connection options
- Optional `realms` field for specifying tenant (defaults to `common`)
  - `common` - Multi-tenant and personal Microsoft accounts
  - `organizations` - Multi-tenant organizational accounts only
  - `consumers` - Personal Microsoft accounts only
  - `{tenant-id}` - Specific tenant ID or domain name
- Uses PKCE for enhanced security
- Default scope: `openid profile email`
- Returns ID token with user claims

## Benefits of This Architecture

1. **Type Safety**: Full TypeScript support with proper interfaces
2. **Self-Contained Strategies**: Each strategy module includes all its metadata (name, logo, methods)
3. **Easy Extension**: Add new strategies with minimal boilerplate
4. **Reusable Components**: Logo components can be used anywhere
5. **Dynamic Rendering**: Components automatically adapt to available strategies
6. **Maintainability**: No wrapper configs needed - everything is in the strategy file
7. **Clean API**: Simple `getSocialStrategy()` function returns everything you need
