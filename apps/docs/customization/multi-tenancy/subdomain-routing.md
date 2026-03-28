---
title: Subdomain Routing
description: Route requests to tenants based on subdomains. Organization-based routing, reserved subdomains, custom domain support, and resolution logic.
---

# Subdomain Routing

Route requests to the correct tenant based on subdomains, enabling tenant-specific URLs and seamless multi-tenant access.

## Overview

Subdomain routing allows you to:

- Access tenants via unique subdomains (e.g., `acme.example.com`)
- Automatically resolve subdomains to tenant IDs
- Reserve subdomains for system use
- Customize subdomain resolution logic
- Support custom domains per tenant

## Basic Configuration

### Organization-Based Routing

The default configuration uses organizations to resolve subdomains:

```typescript
const multiTenancy = setupMultiTenancy({
  subdomainRouting: {
    baseDomain: "auth.example.com",
    useOrganizations: true, // Default
  },
});
```

This maps subdomains to organization names on the main tenant:

| Subdomain                  | Organization | Tenant    |
| -------------------------- | ------------ | --------- |
| `acme.auth.example.com`    | `acme`       | `acme`    |
| `widgets.auth.example.com` | `widgets`    | `widgets` |
| `auth.example.com`         | none         | `main`    |

### Reserved Subdomains

Prevent certain subdomains from being used for tenants:

```typescript
const multiTenancy = setupMultiTenancy({
  subdomainRouting: {
    baseDomain: "auth.example.com",
    reservedSubdomains: [
      "www",
      "api",
      "admin",
      "app",
      "cdn",
      "static",
      "staging",
      "dev",
    ],
  },
});
```

Requests to reserved subdomains are routed to the main tenant.

## Custom Resolution

### Custom Resolver Function

Provide custom logic for subdomain resolution:

```typescript
const multiTenancy = setupMultiTenancy({
  subdomainRouting: {
    baseDomain: "auth.example.com",
    resolveSubdomain: async (subdomain, context) => {
      // Look up tenant by subdomain in database
      const tenant = await db.tenants.findBySubdomain(subdomain);

      if (tenant) {
        return tenant.id;
      }

      // Try organization lookup as fallback
      const org = await db.organizations.findByName(subdomain);
      if (org) {
        return org.tenant_id;
      }

      // Return null to use main tenant
      return null;
    },
  },
});
```

### Database-Backed Resolution

Store subdomain mappings in the database:

```typescript
// Add subdomain column to tenants table
interface Tenant {
  id: string;
  name: string;
  subdomain?: string;
  custom_domain?: string;
}

const multiTenancy = setupMultiTenancy({
  subdomainRouting: {
    baseDomain: "auth.example.com",
    resolveSubdomain: async (subdomain) => {
      // First, try exact subdomain match
      const tenant = await db.query(
        "SELECT id FROM tenants WHERE subdomain = ?",
        [subdomain],
      );

      if (tenant) {
        return tenant.id;
      }

      // Fallback to organization
      const org = await db.query(
        "SELECT id FROM organizations WHERE name = ? AND tenant_id = ?",
        [subdomain, "main"],
      );

      return org ? subdomain : null;
    },
  },
});
```

## Routing Flow

### How It Works

```
┌──────────────────────────────────────────────────────────────────┐
│                    SUBDOMAIN ROUTING FLOW                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Extract subdomain from request host                          │
│     └─> Input: "acme.auth.example.com"                           │
│     └─> Extract: "acme"                                          │
│                                                                   │
│  2. Check if subdomain is reserved                               │
│     └─> If reserved, use main tenant                             │
│     └─> Continue to step 3                                       │
│                                                                   │
│  3. Resolve subdomain to tenant ID                               │
│     └─> Call resolveSubdomain() if provided                      │
│     └─> Or lookup organization with matching name               │
│                                                                   │
│  4. Set tenant context                                           │
│     └─> Store tenant ID in request context                       │
│     └─> Make available to downstream handlers                    │
│                                                                   │
│  5. Load tenant database (if configured)                         │
│     └─> Call getAdapters(tenantId)                               │
│     └─> Inject into request context                              │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Example Flow

Request: `https://acme.auth.example.com/api/users`

1. Extract subdomain: `acme`
2. Check reserved: not reserved
3. Resolve: Look up organization `acme` on main tenant → found
4. Set context: `tenant_id = "acme"`
5. Load database: Get adapters for `acme` tenant
6. Continue: Request proceeds with `acme` tenant context

## Custom Domains

### Supporting Custom Domains

Allow tenants to use their own domains:

```typescript
const multiTenancy = setupMultiTenancy({
  subdomainRouting: {
    baseDomain: "auth.example.com",
    resolveSubdomain: async (subdomain, context) => {
      const host = context.req.header("host");

      // Check for custom domain first
      if (!host?.endsWith("auth.example.com")) {
        const tenant = await db.tenants.findByCustomDomain(host);
        if (tenant) {
          return tenant.id;
        }
      }

      // Fall back to subdomain resolution
      return resolveBySubdomain(subdomain);
    },
  },
});
```

### Custom Domain Setup

Store and validate custom domains:

```typescript
interface TenantWithDomain extends Tenant {
  custom_domain?: string;
  custom_domain_verified?: boolean;
}

async function setCustomDomain(tenantId: string, domain: string) {
  // Validate domain
  if (!isValidDomain(domain)) {
    throw new Error("Invalid domain format");
  }

  // Check DNS records
  const verified = await verifyDNSRecords(domain);

  // Update tenant
  await db.tenants.update(tenantId, {
    custom_domain: domain,
    custom_domain_verified: verified,
  });

  // Generate SSL certificate if verified
  if (verified) {
    await generateSSLCertificate(domain);
  }
}
```

## Middleware Integration

### Subdomain Middleware

The subdomain middleware is automatically included:

```typescript
const multiTenancy = setupMultiTenancy({
  subdomainRouting: {
    baseDomain: "auth.example.com",
  },
});

// Middleware is part of multiTenancy.middleware
app.use("*", multiTenancy.middleware);
```

### Manual Middleware Setup

Use subdomain middleware separately:

```typescript
import { createSubdomainMiddleware } from "@authhero/multi-tenancy";

const subdomainMiddleware = createSubdomainMiddleware({
  subdomainRouting: {
    baseDomain: "auth.example.com",
    reservedSubdomains: ["www", "api"],
  },
});

app.use("*", subdomainMiddleware);
```

## Access Patterns

### In Request Handlers

Access the resolved tenant ID:

```typescript
app.get("/api/users", async (c) => {
  // Tenant ID is available in context
  const tenantId = c.get("tenant_id");

  // Database adapters are already scoped to this tenant
  const users = await c.env.data.users.list(tenantId);

  return c.json({ users });
});
```

### In Hooks

Hooks receive tenant context automatically:

```typescript
const multiTenancy = setupMultiTenancy({
  hooks: {
    preUserSignUp: async (user, context) => {
      const tenantId = context.tenant_id;
      console.log(`User signing up for tenant: ${tenantId}`);
      return user;
    },
  },
});
```

## Multi-Level Subdomains

### Support Nested Subdomains

Handle multiple subdomain levels:

```typescript
const multiTenancy = setupMultiTenancy({
  subdomainRouting: {
    baseDomain: "auth.example.com",
    resolveSubdomain: async (subdomain, context) => {
      const host = context.req.header("host");
      const parts = host?.split(".") || [];

      // Handle: app.acme.auth.example.com
      if (parts.length > 3) {
        const [app, tenant] = parts;

        // Validate app subdomain
        if (["app", "api", "admin"].includes(app)) {
          return tenant;
        }
      }

      // Standard: acme.auth.example.com
      return subdomain;
    },
  },
});
```

### Environment-Specific Subdomains

Support staging/dev environments:

```typescript
const multiTenancy = setupMultiTenancy({
  subdomainRouting: {
    baseDomain: "auth.example.com",
    resolveSubdomain: async (subdomain, context) => {
      const host = context.req.header("host");

      // Handle: acme-staging.auth.example.com
      if (subdomain.includes("-")) {
        const [tenantId, env] = subdomain.split("-");

        if (["staging", "dev", "test"].includes(env)) {
          // Return tenant with environment context
          context.set("environment", env);
          return tenantId;
        }
      }

      // Production: acme.auth.example.com
      context.set("environment", "production");
      return subdomain;
    },
  },
});
```

## Wildcard SSL

### Certificate Management

Handle SSL certificates for wildcard domains:

```typescript
// Cloudflare example
async function setupWildcardSSL(baseDomain: string) {
  // Cloudflare automatically handles wildcard SSL
  // for domains on their platform

  // For custom setup:
  await certbot.obtain({
    domain: `*.${baseDomain}`,
    email: "admin@example.com",
    method: "dns",
  });
}

// Let's Encrypt with DNS challenge
async function obtainWildcardCert(baseDomain: string) {
  return await acme.certificate.create({
    domains: [`*.${baseDomain}`, baseDomain],
    challenge: "dns-01",
    dns: {
      provider: "cloudflare",
      token: process.env.CLOUDFLARE_API_TOKEN,
    },
  });
}
```

## DNS Configuration

### Setup Instructions

Configure DNS for subdomain routing:

```dns
; Wildcard A record for IPv4
*.auth.example.com.  IN  A  203.0.113.1

; Wildcard AAAA record for IPv6
*.auth.example.com.  IN  AAAA  2001:db8::1

; Or wildcard CNAME to load balancer
*.auth.example.com.  IN  CNAME  lb.example.com.
```

### Cloudflare Configuration

Using Cloudflare DNS:

```typescript
async function setupCloudflare DNS(baseDomain: string) {
  const zone = await cloudflare.zones.get(baseDomain);

  // Create wildcard DNS record
  await cloudflare.dnsRecords.create(zone.id, {
    type: "A",
    name: `*.auth`,
    content: "203.0.113.1",
    proxied: true, // Enable Cloudflare proxy
  });
}
```

## Validation and Security

### Validate Subdomains

Ensure subdomains are valid:

```typescript
function isValidSubdomain(subdomain: string): boolean {
  // RFC 1123 subdomain rules
  const pattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
  return pattern.test(subdomain);
}

const multiTenancy = setupMultiTenancy({
  subdomainRouting: {
    baseDomain: "auth.example.com",
    resolveSubdomain: async (subdomain) => {
      if (!isValidSubdomain(subdomain)) {
        return null; // Use main tenant
      }

      return await resolveTenant(subdomain);
    },
  },
});
```

### Prevent Subdomain Squatting

Check subdomain availability:

```typescript
async function isSubdomainAvailable(subdomain: string): Promise<boolean> {
  // Check reserved list
  if (RESERVED_SUBDOMAINS.includes(subdomain)) {
    return false;
  }

  // Check existing tenants
  const existing = await db.tenants.findBySubdomain(subdomain);
  if (existing) {
    return false;
  }

  // Check existing organizations
  const org = await db.organizations.findByName(subdomain);
  if (org) {
    return false;
  }

  return true;
}
```

### Rate Limiting

Apply rate limits per subdomain:

```typescript
import { rateLimiter } from "@/middleware/rate-limit";

app.use("*", async (c, next) => {
  const subdomain = extractSubdomain(c.req.header("host"));

  // Apply rate limit based on subdomain/tenant
  await rateLimiter.check({
    key: `tenant:${subdomain}`,
    limit: 1000, // requests per hour
    window: 3600,
  });

  await next();
});
```

## Best Practices

### 1. Cache Subdomain Resolution

Cache resolved subdomains to reduce database queries:

```typescript
const cache = new Map<string, string>();

const multiTenancy = setupMultiTenancy({
  subdomainRouting: {
    baseDomain: "auth.example.com",
    resolveSubdomain: async (subdomain) => {
      // Check cache
      if (cache.has(subdomain)) {
        return cache.get(subdomain)!;
      }

      // Resolve and cache
      const tenantId = await resolveTenant(subdomain);
      if (tenantId) {
        cache.set(subdomain, tenantId);
      }

      return tenantId;
    },
  },
});
```

### 2. Handle Missing Tenants

Gracefully handle non-existent subdomains:

```typescript
const multiTenancy = setupMultiTenancy({
  subdomainRouting: {
    resolveSubdomain: async (subdomain) => {
      const tenantId = await resolveTenant(subdomain);

      if (!tenantId) {
        // Log for monitoring
        console.warn(`Unknown subdomain: ${subdomain}`);
      }

      // Return null to use main tenant as fallback
      return tenantId;
    },
  },
});
```

### 3. Monitor Subdomain Usage

Track subdomain access patterns:

```typescript
app.use("*", async (c, next) => {
  const subdomain = extractSubdomain(c.req.header("host"));
  const tenantId = c.get("tenant_id");

  // Track usage
  await analytics.track({
    event: "subdomain_access",
    properties: {
      subdomain,
      tenant_id: tenantId,
      path: c.req.path,
    },
  });

  await next();
});
```

### 4. Validate During Tenant Creation

Ensure subdomain is valid when creating tenants:

```typescript
async function createTenant(data: TenantInput) {
  // Validate subdomain
  if (data.subdomain) {
    if (!isValidSubdomain(data.subdomain)) {
      throw new Error("Invalid subdomain format");
    }

    if (!(await isSubdomainAvailable(data.subdomain))) {
      throw new Error("Subdomain already taken");
    }
  }

  return await db.tenants.create(data);
}
```

## Next Steps

- [API Reference](./api-reference.md) - Complete API documentation
- [Migration Guide](./migration.md) - Migrate from single to multi-tenant
- [Architecture](./architecture.md) - Understanding the organization-tenant model
