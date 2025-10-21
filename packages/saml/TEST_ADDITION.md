# SAML Package Tests Added

## Problem

The CI/CD pipeline was failing because the `@authhero/saml` package had a test script but no test files:

```
packages/saml test: No test files found, exiting with code 1
packages/saml test: Failed
```

## Solution

Created a basic test suite in `packages/saml/test/saml.spec.ts` with tests covering:

### 1. createSamlMetadata
- ✅ Tests that valid SAML metadata XML is created
- ✅ Verifies entityId, assertionConsumerServiceUrl, and certificates are included

### 2. HttpSamlSigner
- ✅ Tests that HttpSamlSigner can be instantiated
- ✅ Verifies the signSAML method exists

## Test Results

```bash
Test Files  1 passed (1)
Tests      3 passed (3)
Duration   ~300ms
```

## Files Created

- `packages/saml/test/saml.spec.ts` - Basic test suite for SAML functionality

## Why These Tests?

These tests provide:
1. **Smoke tests** - Verify the package builds and exports work correctly
2. **API validation** - Ensure the public API matches expected signatures
3. **CI/CD compatibility** - Prevent "no tests found" errors in the pipeline

## Future Test Improvements

Consider adding:
- `parseSamlRequestQuery` tests with real SAML request fixtures
- `createSamlResponse` tests with different configurations
- Integration tests for LocalSamlSigner (if xml-crypto is available)
- Error handling tests
- Edge case tests (missing parameters, invalid XML, etc.)

## Running Tests

```bash
# In the saml package
cd packages/saml
pnpm test

# From monorepo root
pnpm --filter @authhero/saml test

# All tests
pnpm -r test
```
