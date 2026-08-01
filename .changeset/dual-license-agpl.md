---
"authhero": major
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": major
"@authhero/drizzle": major
"@authhero/aws-adapter": major
"@authhero/cloudflare-adapter": major
"@authhero/saml": minor
"@authhero/multi-tenancy": major
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
`@authhero/widget` are **MIT** — using these packages on their own imposes no AGPL
obligations on your code. Use of the AGPL-licensed packages remains subject to
AGPL-3.0-only (or a commercial license).

Versions published before this release remain available under their original MIT
terms. See LICENSING.md in the repository for the full model, and CLA.md for the
contributor agreement that keeps dual licensing possible.
