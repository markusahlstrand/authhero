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
- `uploadCertificate(tenantId, domainId, { certificate, private_key })` - Install a customer-supplied PEM certificate and private key on the Cloudflare custom hostname (BYOC)

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

// Upload a customer-supplied certificate (Cloudflare BYOC)
await customDomains.uploadCertificate!("tenant-123", "domain-id-456", {
  certificate: "-----BEGIN CERTIFICATE-----\n...",
  private_key: "-----BEGIN PRIVATE KEY-----\n...",
});
```

## Bring Your Own Certificate (BYOC)

The adapter exposes an optional `uploadCertificate` method that forwards a PEM-encoded certificate and private key to Cloudflare's Custom Hostnames API. The cert and key are installed at the edge and are never persisted by AuthHero.

The management API exposes this as `PUT /api/v2/custom-domains/{id}/certificate` (scope: `update:custom_domains`). If the configured custom-domain adapter doesn't implement `uploadCertificate`, the route returns `501 Not Implemented`.

To convert a PFX file to the expected PEM format:

```sh
openssl pkcs12 -in cert.pfx -nodes -out cert.pem
```

Then split `cert.pem` into the certificate chain (everything between `BEGIN CERTIFICATE` / `END CERTIFICATE` blocks, leaf first) and the private key block.

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

// Hand the Cloudflare-backed adapter to authhero in place of the DB one, so a
// create both registers the hostname and stores the mapping.
export const dataAdapter = {
  ...database,
  customDomains: cloudflareAdapters.customDomains,
};
```

## Where this adapter belongs

This adapter needs Cloudflare **account** credentials (`zoneId` / `authKey` / `authEmail`), so it can only run where those credentials live.

- **Single instance** — wire it into `dataAdapter.customDomains`, as above.
- **Workers for Platforms** — wire it into the **control plane only**, and pass it as `proxyControlPlane.customDomains`. Tenant Workers have no account credentials and cannot see other tenants' domains, so they write through the control plane with [`createControlPlaneCustomDomainsAdapter`](/customization/multi-tenancy/control-plane#custom-domains-the-control-plane-is-authoritative) and keep a local read-cache mirror. A tenant Worker that talks straight to its own database stores a row that Cloudflare never hears about — the domain will not route.

## Related Documentation

- [Cloudflare API](https://developers.cloudflare.com/api/)
- [Custom Domain Setup Guide](/deployment/custom-domain-setup) — DNS, TLS, and routing topologies end to end
- [Proxy package](/customization/proxy/) — the reverse proxy that resolves these custom domains and dispatches them to tenants
- [Control plane authority for custom domains](/customization/multi-tenancy/control-plane#custom-domains-the-control-plane-is-authoritative) — how tenant shards register domains they have no credentials for
- [Multi-Tenancy architecture](/architecture/multi-tenancy) — how custom domains fit the control plane / proxy / WFP picture
