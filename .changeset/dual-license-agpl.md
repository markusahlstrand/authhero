---
"authhero": minor
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"@authhero/aws-adapter": minor
"@authhero/cloudflare-adapter": minor
"@authhero/saml": minor
"@authhero/multi-tenancy": minor
"@authhero/proxy": minor
"@authhero/admin": minor
"@authhero/widget": minor
"create-authhero": minor
---

**License change: AuthHero is now dual-licensed (AGPL-3.0-only or commercial).**

The core server and its runtime packages (`authhero`, the database adapters, `saml`,
`multi-tenancy`, `proxy`, `@authhero/admin`) are now licensed **AGPL-3.0-only**, with
commercial licenses available. The integration surfaces stay permissive:
`@authhero/adapter-interfaces`, `create-authhero` (and the apps it scaffolds), and
`@authhero/widget` are **MIT** — building on AuthHero never pulls your own code into
the AGPL.

Versions published before this release remain available under their original MIT
terms. See LICENSING.md in the repository for the full model, and CLA.md for the
contributor agreement that keeps dual licensing possible.
