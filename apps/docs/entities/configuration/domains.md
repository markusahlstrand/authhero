---
title: Domains
description: Custom domains for branded authentication URLs in AuthHero.
---

# Domains

Domains represent the URLs where your authentication pages are hosted. AuthHero supports custom domains for a branded authentication experience.

## Default Domain

Every tenant gets a default domain on the AuthHero instance (e.g., `auth.example.com`).

## Custom Domains

You can configure custom domains so users see your brand during authentication:

- `login.yourcompany.com` instead of `auth.example.com`
- Custom TLS certificates
- Per-tenant domain configuration

### Setting Up a Custom Domain

1. Add a CNAME record pointing your domain to the AuthHero instance
2. Configure the domain in the Management API or Admin UI
3. AuthHero will serve authentication pages on your custom domain

Custom domains are especially important for:
- **White-label authentication** — Each customer sees their own domain
- **Trust** — Users see a familiar URL when logging in
- **Cookie isolation** — Session cookies scoped to your domain

See [Deployment — Custom Domain Setup](/deployment/custom-domain-setup) for detailed instructions.
