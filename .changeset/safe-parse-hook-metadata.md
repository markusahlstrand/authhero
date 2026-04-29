---
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Defensively parse the hook `metadata` JSON blob on read.

Wraps `JSON.parse` in a try/catch in `hooks.get` and `hooks.list` (kysely + drizzle) and only accepts the result when it's a plain object. Malformed payloads, arrays, primitives, or legacy rows now collapse to `undefined` instead of throwing — a single corrupt row no longer breaks hook retrieval for the whole tenant. Adds a shared `parseJsonObjectIfDefined` helper next to `parseJsonIfDefined` in the kysely adapter.
