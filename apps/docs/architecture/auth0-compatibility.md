---
title: Auth0 Compatibility
description: AuthHero is compatible with Auth0 APIs and SDKs, with a few key differences.
---

# Auth0 Compatibility

AuthHero implements the Auth0 Management API v2 and Authentication API, which means you can use existing Auth0 SDKs and tools with minimal changes.

## What Works the Same

- **Auth0 SDKs** — `auth0-spa-js`, `auth0-react`, `nextjs-auth0`, and other client libraries work by pointing them at your AuthHero instance
- **Management API** — The `/api/v2/*` endpoints follow Auth0's API contract for users, clients, connections, roles, organizations, and more
- **OAuth2/OIDC** — Standard authorization code flow, PKCE, client credentials, refresh tokens, and device authorization
- **Token format** — JWT access tokens and ID tokens with the same claim structure
- **RBAC** — Resource servers, scopes, roles, and permissions work the same way
- **Organizations** — Organization membership, roles, and invitations follow the same model

## Key Differences

### Self-Hosted

AuthHero runs in your infrastructure. You control the database, the deployment, and the data. There is no hosted dashboard — use the React Admin UI or the Management API directly.

### Hooks Instead of Actions

Auth0 uses "Actions" (JavaScript snippets that run in Auth0's cloud). AuthHero uses **hooks** — either code-based callbacks in your application or URL webhooks:

- **Code hooks** — Functions you pass during initialization (`onExecutePostLogin`, `onExecutePreUserRegistration`, etc.)
- **URL hooks** — HTTP webhooks configured via the Management API
- **Form hooks** — Custom forms rendered during the auth flow

AuthHero also supports hooks that Auth0 doesn't offer, such as `onExecutePreUserDeletion` and `onExecutePostUserDeletion`.

See [Auth0 Comparison — Hooks](/auth0-comparison/hooks) for a detailed mapping.

### Account Linking

AuthHero supports account linking but with some differences in how linked accounts are updated. Updates to linked (secondary) accounts must go through the primary account.

See [Auth0 Comparison — Account Linking](/auth0-comparison/account-linking) for details.

### Multi-Tenancy

Auth0 uses one tenant per Auth0 account. AuthHero supports multiple tenants in a single instance, with optional organization-based isolation using the `@authhero/multi-tenancy` package.

See [Auth0 Comparison — Multi-Tenant](/auth0-comparison/multi-tenant) for details.

### Redirect URLs

AuthHero handles redirect URL validation with some differences in wildcard and localhost handling.

See [Auth0 Comparison — Redirect URLs](/auth0-comparison/redirect-urls) for details.

## Migrating from Auth0

To migrate from Auth0 to AuthHero:

1. Set up an AuthHero instance
2. Use the `auth0-proxy` app to forward traffic during migration
3. Migrate users, clients, and connections via the Management API
4. Update your application's Auth0 configuration to point to AuthHero
5. Auth0 SDKs continue to work — just change the domain

See the [Auth0 Comparison](/auth0-comparison/) section for detailed migration guides.
