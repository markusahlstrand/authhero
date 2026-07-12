---
"@authhero/drizzle": patch
---

Fix runtime crash in the ESM bundle when creating connections, organizations, resource servers, invites, or hooks. Five adapters loaded nanoid with a lazy `require("nanoid")`, which worked while nanoid was bundled into the dist but throws under Node ESM now that nanoid is external. Replaced with top-level ESM imports.
