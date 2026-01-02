---
title: Custom Domains Adapter
description: Manage custom domains through Cloudflare API with automatic SSL certificates and DNS configuration for AuthHero authentication pages.
---

# Custom Domains Adapter

The Custom Domains adapter manages custom domains through the Cloudflare API, handling SSL certificates and DNS configuration automatically.

## Configuration

```typescript
{
  zoneId: string;              // Your Cloudflare zone ID
  authKey: string;             // Your Cloudflare API key
  authEmail: string;           // Your Cloudflare account email
  enterprise?: boolean;        // Whether using Cloudflare Enterprise (default: false)
  customDomainAdapter: CustomDomainsAdapter; // Database adapter for storing domain data
}
```

## Methods

The custom domains adapter provides the following methods:

- `create(tenantId, domain)` - Create a custom domain
- `get(tenantId, domainId)` - Get a custom domain by ID
- `getByDomain(domain)` - Get a custom domain by domain name
- `list(tenantId, params)` - List custom domains with pagination
- `remove(tenantId, domainId)` - Remove a custom domain
- `update(tenantId, domainId, data)` - Update a custom domain

## Usage Example

```typescript
// Create a custom domain
const domain = await customDomains.create("tenant-123", {
  domain: "auth.example.com",
  // Additional configuration...
});

// Get domain by name
const existingDomain = await customDomains.getByDomain("auth.example.com");

// List all domains for a tenant
const { domains, total } = await customDomains.list("tenant-123", {
  page: 0,
  per_page: 10,
});

// Remove a domain
await customDomains.remove("tenant-123", "domain-id-456");
```

## Environment Variables

```env
# Custom Domains
CLOUDFLARE_ZONE_ID=your_zone_id
CLOUDFLARE_AUTH_KEY=your_api_key
CLOUDFLARE_AUTH_EMAIL=your_email
CLOUDFLARE_ENTERPRISE=false
```

## Integration Example

```typescript
import createAdapters from "@authhero/cloudflare-adapter";
import { createKyselyAdapter } from "@authhero/kysely-adapter";

// Create database adapter for custom domains
const database = createKyselyAdapter(db);

// Create Cloudflare adapters
const cloudflareAdapters = createAdapters({
  zoneId: process.env.CLOUDFLARE_ZONE_ID!,
  authKey: process.env.CLOUDFLARE_AUTH_KEY!,
  authEmail: process.env.CLOUDFLARE_AUTH_EMAIL!,
  customDomainAdapter: database.customDomains,
});

// Use in your application
export const customDomains = cloudflareAdapters.customDomains;
```

## Related Documentation

- [Cloudflare API](https://developers.cloudflare.com/api/)
- [Custom Domain Setup Guide](/guides/custom-domain-setup)
