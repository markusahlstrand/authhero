---
"@authhero/kysely-adapter": minor
"@authhero/cloudflare-adapter": patch
"@authhero/aws-adapter": patch
"@authhero/adapter-interfaces": patch
"@authhero/saml": patch
---

Move `kysely` from `dependencies` to `peerDependencies` in `@authhero/kysely-adapter` so consumers control the installed version and avoid duplicate Kysely instances.

Switch every adapter package's `.d.ts` bundling from `dts-bundle-generator` to `rollup-plugin-dts` (the same tool already used by `authhero`). Adds `export *` for previously-unexported adapter modules in `@authhero/adapter-interfaces` so the new bundler emits them (the old tool re-exported them implicitly).
