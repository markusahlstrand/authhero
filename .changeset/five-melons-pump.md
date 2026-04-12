---
"@authhero/adapter-interfaces": major
"create-authhero": minor
"@authhero/multi-tenancy": minor
"@authhero/cloudflare-adapter": minor
"@authhero/widget": minor
"authhero": minor
"@authhero/react-admin": minor
"@authhero/drizzle": minor
"@authhero/kysely-adapter": minor
"@authhero/aws-adapter": minor
---

Add support for dynamic code

BREAKING CHANGE: `DataAdapters` now requires a `hookCode: HookCodeAdapter` property. Adapters implementing `DataAdapters` must provide a `hookCode` adapter with `create`, `get`, `update`, and `remove` methods for managing hook code storage. See `packages/kysely/src/hook-code/` for a reference implementation.
