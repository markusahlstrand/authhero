---
title: Cloudflare Adapter
description: Custom domain support for AuthHero using Cloudflare services. Domain verification, SSL certificates, and DNS record management.
---

# Cloudflare Adapter

The Cloudflare adapter provides custom domain support for AuthHero using Cloudflare services. It allows you to set up and manage custom domains for your authentication pages.

## Features

- Custom domain setup and configuration
- Domain verification
- SSL certificate management
- DNS record management

## Installation

Install the Cloudflare adapter package:

```bash
pnpm add authhero-cloudflare-adapter
```

## Usage

```typescript
import { AuthHero } from 'authhero';
import { CloudflareAdapter } from 'authhero-cloudflare-adapter';

// Create the adapter
const cloudflareAdapter = new CloudflareAdapter({
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
  // other configuration options
});

// Initialize AuthHero with the adapter
const authHero = new AuthHero({
  adapter: primaryAdapter, // Your primary database adapter
  cloudflareAdapter, // The Cloudflare adapter for custom domains
  // other configuration options
});
```

## Configuration Options

- `apiToken`: Cloudflare API token with appropriate permissions
- `zone`: Cloudflare zone ID (optional, can be determined from the domain)
- `accountId`: Cloudflare account ID

## Setting Up a Custom Domain

```typescript
// Example code for setting up a custom domain
await authHero.domains.create({
  domain: 'auth.example.com',
  tenantId: 'tenant-123',
  // other domain options
});
```

## Verification Process

[Domain verification process will be documented here]

## Troubleshooting

[Common issues and solutions will be documented here]