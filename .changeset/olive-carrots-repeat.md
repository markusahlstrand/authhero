---
"@authhero/adapter-interfaces": patch
"@authhero/cloudflare-adapter": patch
"@authhero/multi-tenancy": patch
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
"@authhero/proxy": patch
"@authhero/widget": patch
"authhero": patch
---

chore: apply repo-wide Prettier formatting

Formatting-only sweep, no behavior change. Generated output (Stencil loader/hydrate,
drizzle-kit migration metadata, the built tailwind CSS blob) is now listed in
`.prettierignore` so it is not reformatted on every build, and `lint-staged` runs in
the pre-commit hook to keep formatting from drifting again.
