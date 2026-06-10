---
"authhero": patch
"@authhero/aws-adapter": patch
"@authhero/cloudflare-adapter": patch
"@authhero/kysely-adapter": patch
"@authhero/proxy": patch
---

Add `rollup` as an explicit devDependency so the build works on CI where the peer dependency of `rollup-plugin-dts` is not auto-hoisted.
