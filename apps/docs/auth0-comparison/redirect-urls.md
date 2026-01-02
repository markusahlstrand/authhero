---
title: Redirect URLs Comparison
description: AuthHero provides enhanced redirect URL wildcards including subdomain and path wildcards for flexible multi-tenant and deployment URL matching.
---

# Redirect URLs: AuthHero vs. Auth0

AuthHero provides more flexible redirect URL validation compared to Auth0, allowing both subdomain wildcards and path wildcards that can be combined for powerful URL matching patterns.

## AuthHero's Flexible Redirect URL System

AuthHero supports enhanced wildcard patterns for redirect URLs that go beyond Auth0's capabilities:

### Subdomain Wildcards

- **Pattern**: `https://*.example.com/callback`
- **Matches**:
  - `https://app.example.com/callback`
  - `https://admin.example.com/callback`
  - `https://client-123.example.com/callback`
- **Use Case**: Perfect for multi-tenant applications where each tenant gets its own subdomain

### Path Wildcards

- **Pattern**: `https://example.com/*`
- **Matches**:
  - `https://example.com/callback`
  - `https://example.com/auth/callback`
  - `https://example.com/tenant/123/callback`
- **Use Case**: Flexible routing for different authentication flows or tenant-specific paths

### Combined Wildcards

- **Pattern**: `https://*.vercel.sesamy.dev/*`
- **Matches**:
  - `https://app-xyz123.vercel.sesamy.dev/subscriptions/callback`
  - `https://preview-abc456.vercel.sesamy.dev/auth/redirect`
  - `https://staging-test.vercel.sesamy.dev/tenant/callback`
- **Use Case**: Dynamic deployment environments (Vercel, Netlify) with flexible routing

## Configuration

AuthHero's wildcard support is opt-in and can be configured per validation:

```typescript
isValidRedirectUrl(redirectUrl, allowedUrls, {
  allowPathWildcards: true, // Enable /* path matching
  allowSubDomainWildcards: true, // Enable *.domain.com matching
});
```

## Security Considerations

- **Protocol Restriction**: Wildcards are only supported for `http:` and `https:` protocols for security
- **Proper Domain Boundaries**: Subdomain wildcards ensure proper domain boundaries (prevents `evilexample.com` from matching `*.example.com`)
- **Exact Protocol Matching**: Protocol must match exactly (no wildcard protocols)

## Key Differences Summarized

| Feature                 | Auth0                  | AuthHero                               |
| ----------------------- | ---------------------- | -------------------------------------- |
| **Subdomain Wildcards** | Limited support        | Full `*.domain.com` support            |
| **Path Wildcards**      | Not supported          | Full `/*` and `/path/*` support        |
| **Combined Wildcards**  | Not supported          | `*.domain.com/*` patterns supported    |
| **Configuration**       | Global tenant setting  | Per-validation configuration           |
| **Security Model**      | Restrictive by default | Flexible with opt-in wildcard features |
| **Use Cases**           | Static redirect URLs   | Dynamic deployments, multi-tenant apps |

## Common Use Cases

### Vercel/Netlify Deployments

Perfect for preview deployments where each branch gets a unique subdomain:

```
Allowed: https://*.vercel.app/auth/callback
Matches: https://my-app-git-feature-user.vercel.app/auth/callback
```

### Multi-Tenant SaaS

Support tenant-specific subdomains with flexible paths:

```
Allowed: https://*.yoursaas.com/*
Matches: https://customer1.yoursaas.com/dashboard/callback
```

### Development Environments

Flexible local development and staging environments:

```
Allowed: https://*.staging.example.com/*
Matches: https://feature-branch.staging.example.com/auth/redirect
```

AuthHero's enhanced redirect URL validation provides the flexibility needed for modern deployment strategies while maintaining security through proper validation and opt-in configuration.
