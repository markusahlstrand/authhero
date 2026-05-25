# @authhero/saml

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
