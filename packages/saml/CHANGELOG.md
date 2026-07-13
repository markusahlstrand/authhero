# @authhero/saml

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
