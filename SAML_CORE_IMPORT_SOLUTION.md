# SAML Core Import - Zero xml-crypto Bundle

## Summary

Successfully created a **tree-shakeable** version of `@authhero/saml` that **completely eliminates xml-crypto imports** when using the `/core` entry point.

## The Problem You Asked About

> "If we use the http connection for saml, will I get rid of the heavy xml-crypto imports then? If we only import the types?"

**Answer: YES! ✅** But you need to use the `/core` import path instead of the default import.

## The Solution

### ❌ Before (Still includes xml-crypto reference)

```typescript
import { createSamlResponse, HttpSamlSigner } from "@authhero/saml";
// Even if you only use HttpSamlSigner, this import path includes LocalSamlSigner
// which has: await import("xml-crypto")
```

### ✅ After (Zero xml-crypto references)

```typescript
import { createSamlResponse, HttpSamlSigner } from "@authhero/saml/core";
// This import path excludes LocalSamlSigner completely
// No xml-crypto imports at all!
```

## What Changed

### New Package Exports Structure

```json
{
  "exports": {
    ".": {
      "import": "./dist/saml.mjs", // Full (65 KB) - includes LocalSamlSigner
      "require": "./dist/saml.cjs"
    },
    "./core": {
      "import": "./dist/core.mjs", // Core (64 KB) - NO LocalSamlSigner ✅
      "require": "./dist/core.cjs"
    },
    "./local-signer": {
      "import": "./dist/local-signer.mjs", // Only signer (1.2 KB)
      "require": "./dist/local-signer.cjs"
    }
  }
}
```

### New Source Files

- **`src/core.ts`**: Exports everything except LocalSamlSigner
- **`src/local-signer.ts`**: Exports only LocalSamlSigner
- **`src/index.ts`**: Exports everything (original behavior)

### Build Configuration

Created separate Vite configs:

- `vite.config.main.ts` → builds `saml.{mjs,cjs}`
- `vite.config.core.ts` → builds `core.{mjs,cjs}` (excludes xml-crypto)
- `vite.config.local.ts` → builds `local-signer.{mjs,cjs}`

## Verification

### ✅ Core bundle has ZERO xml-crypto references:

```bash
$ grep -i "xml-crypto" packages/saml/dist/core.mjs
# (no output - clean!)
```

### ✅ Main bundle still has xml-crypto (for backward compatibility):

```bash
$ grep -i "xml-crypto" packages/saml/dist/saml.mjs
const { SignedXml } = await import("xml-crypto")
```

## Updated authhero Package

The authhero package now uses the core import:

```typescript
// packages/authhero/src/strategies/saml.ts
import { createSamlResponse, HttpSamlSigner } from "@authhero/saml/core";
```

**Result:** The authhero package now has **ZERO xml-crypto dependencies**! 🎉

## Usage Guide

### For Edge Environments (Cloudflare Workers, Deno, etc.)

```typescript
import { createSamlResponse, HttpSamlSigner } from "@authhero/saml/core";

const signer = new HttpSamlSigner(process.env.SAML_SIGN_URL);
const response = await createSamlResponse(params, signer);
```

**Benefits:**

- ✅ No xml-crypto imports
- ✅ No Node.js native dependencies
- ✅ Smaller bundle
- ✅ Works in all edge environments

### For Node.js with Local Signing

```typescript
// Option 1: Use full import
import { createSamlResponse, LocalSamlSigner } from "@authhero/saml";

// Option 2: Mix core + local-signer
import { createSamlResponse } from "@authhero/saml/core";
import { LocalSamlSigner } from "@authhero/saml/local-signer";

const signer = new LocalSamlSigner();
const response = await createSamlResponse(params, signer);
```

### For Types Only

```typescript
import type { SAMLResponseParams, SamlSigner } from "@authhero/saml/core";
// Zero runtime imports, types only
```

## Bundle Size Comparison

| Import Path                   | Size (mjs) | xml-crypto  | Best For                   |
| ----------------------------- | ---------- | ----------- | -------------------------- |
| `@authhero/saml`              | 65 KB      | ✅ Yes      | Node.js with local signing |
| `@authhero/saml/core` ⭐      | 64 KB      | ❌ **None** | **Edge environments**      |
| `@authhero/saml/local-signer` | 1.2 KB     | ✅ Yes      | Import signer only         |

## Testing

All 395 tests pass ✅

```bash
Test Files  72 passed (72)
     Tests  395 passed (395)
  Duration  14.69s
```

## Migration Checklist

- [x] Create separate entry points (core, local-signer)
- [x] Configure Vite to build multiple bundles
- [x] Generate type definitions for each entry
- [x] Update package.json exports
- [x] Update authhero package to use core import
- [x] Verify no xml-crypto in core bundle
- [x] Test all functionality
- [x] Document usage patterns

## Files Modified

**New Files:**

- `packages/saml/src/core.ts`
- `packages/saml/src/local-signer.ts`
- `packages/saml/vite.config.main.ts`
- `packages/saml/vite.config.core.ts`
- `packages/saml/vite.config.local.ts`
- `packages/saml/BUNDLE_COMPARISON.md`

**Updated Files:**

- `packages/saml/package.json` (exports, build scripts)
- `packages/saml/dts-bundle-generator.config.ts`
- `packages/saml/README.md`
- `packages/authhero/src/strategies/saml.ts` (uses core import)

## Conclusion

**Question:** "If we use the http connection for saml, will I get rid of the heavy xml-crypto imports?"

**Answer:** **YES!** ✅

By using `@authhero/saml/core` instead of `@authhero/saml`, you get:

- ✅ Zero xml-crypto imports or references
- ✅ All SAML functionality (types, helpers, HttpSamlSigner)
- ✅ Perfect for edge deployments
- ✅ ~1 KB smaller bundle
- ✅ No Node.js native module issues

The authhero package now uses this core import by default, making it edge-compatible out of the box!
