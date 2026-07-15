# @authhero/saml

## 0.4.6

### Patch Changes

- cbd5c0c: Migrate from fast-xml-parser v4 to v5 (^5.7.0). Resolves the remaining Dependabot alert (XMLBuilder XML comment/CDATA injection via unescaped delimiters), which is only patched on the v5 line. No API changes: parser options and the preserveOrder builder structures are unchanged between v4 and v5.
- Updated dependencies [32ceb43]
  - @authhero/adapter-interfaces@4.1.0

## 0.4.5

### Patch Changes

- 47db71e: Security dependency bumps for open Dependabot alerts:

  - `@authhero/saml`: fast-xml-parser `^4.5.1` → `^4.5.5` (DOCTYPE entity-encoding bypass, entity-expansion DoS) and @xmldom/xmldom 0.8.13 via xml-crypto (XML injection in serialization)
  - `@authhero/drizzle`: drizzle-orm `^0.44.2` → `^0.45.2` (SQL injection via improperly escaped identifiers)
  - `@authhero/aws-adapter`: @aws-sdk/client-dynamodb and @aws-sdk/lib-dynamodb `^3.700.0` → `^3.1085.0` (pulls patched fast-xml-parser 5.x)
  - `authhero`: regenerated client bundle against hono 4.12.30 (CORS middleware reflected any Origin with credentials when origin defaulted to wildcard)

## 0.4.4

### Patch Changes

- Updated dependencies [da635f1]
- Updated dependencies [5ede4a0]
  - @authhero/adapter-interfaces@4.0.0

## 0.4.3

### Patch Changes

- dbb6e70: Add canonical base64, base32, and hex encoding helpers to @authhero/adapter-interfaces (encodeBase64/decodeBase64, encodeBase32/decodeBase32, encodeHex) and migrate all authhero and saml call sites off oslo's encoding module (step 2 of #1099). oslo's sha256 wrapper is replaced with direct crypto.subtle.digest calls, and the oslo dependency is dropped from @authhero/saml entirely.
- Updated dependencies [dbb6e70]
  - @authhero/adapter-interfaces@3.12.0

## 0.4.2

### Patch Changes

- e0d6e50: Add `rollup` as an explicit devDependency so the build works on CI where the peer dependency of `rollup-plugin-dts` is not auto-hoisted.

## 0.4.1

### Patch Changes

- 528e196: Move `kysely` from `dependencies` to `peerDependencies` in `@authhero/kysely-adapter` so consumers control the installed version and avoid duplicate Kysely instances.

  Switch every adapter package's `.d.ts` bundling from `dts-bundle-generator` to `rollup-plugin-dts` (the same tool already used by `authhero`). Adds `export *` for previously-unexported adapter modules in `@authhero/adapter-interfaces` so the new bundler emits them (the old tool re-exported them implicitly).

## 0.4.0

### Minor Changes

- dcc6501: Migrate to Zod 4 and `@hono/zod-openapi` v1. The `@hono/zod-openapi` peer dependency now requires `^1.4.0` — consumers must upgrade alongside this release.

## 0.3.0

### Minor Changes

- Fix SAML response format for vimeo

## 0.2.0

### Minor Changes

- e52a74e: Move saml to separate package

## 0.1.0

### Minor Changes

- Initial release
- Extracted SAML functionality from authhero package
- Support for pluggable signing implementations (local and HTTP-based)
