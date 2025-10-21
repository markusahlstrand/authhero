# Bundle Size Comparison: @authhero/saml Import Strategies

## Overview

The `@authhero/saml` package provides **three import paths** to optimize bundle size based on your deployment environment.

⚠️ **Important:** The package files themselves are small (64-65 KB), but when you use `LocalSamlSigner`, the `xml-crypto` dependency and its transitive dependencies add **~240 KB** to your final bundle!

## Real-World Bundle Sizes (with dependencies)

### 1. Full Import with LocalSamlSigner (`@authhero/saml`)

```typescript
import {
  createSamlResponse,
  HttpSamlSigner,
  LocalSamlSigner,
} from "@authhero/saml";
```

**Package Files:**

- `dist/saml.mjs` - 65 KB (gzipped: ~15 KB)
- `dist/saml.cjs` - 43 KB (gzipped: ~12 KB)

**ACTUAL Bundled Size (with xml-crypto):**

- **~305 KB minified** (gzipped: ~82 KB) 🚨
- Includes: xml-crypto (348 KB), @xmldom/xmldom (208 KB), xpath (264 KB), @xmldom/is-dom-node (32 KB)

**Contains:**

- ✅ All SAML types
- ✅ SAML helpers (metadata, response creation)
- ✅ HttpSamlSigner
- ✅ LocalSamlSigner (with xml-crypto dynamic import)

**xml-crypto references:** ✅ YES

```javascript
const { SignedXml } = await import("xml-crypto");
```

**Dependencies pulled in:**

- `xml-crypto@6.1.2` (348 KB)
- `@xmldom/xmldom@0.8.10` (208 KB)
- `xpath@0.0.33` (264 KB)
- `@xmldom/is-dom-node@1.0.1` (32 KB)
- **Total dependencies: ~850 KB unminified!**

**Best for:** Node.js environments where you MUST have local signing capability

---

### 2. Core Import (`@authhero/saml/core`) ⭐ **RECOMMENDED FOR EDGE**

```typescript
import { createSamlResponse, HttpSamlSigner } from "@authhero/saml/core";
```

**Package Files:**

- `dist/core.mjs` - 64 KB (gzipped: ~14.7 KB)
- `dist/core.cjs` - 42.5 KB (gzipped: ~12.3 KB)

**ACTUAL Bundled Size (without xml-crypto):**

- **~105 KB minified** (gzipped: ~28 KB) ✅
- **~200 KB smaller than full import!**

**Contains:**

- ✅ All SAML types
- ✅ SAML helpers (metadata, response creation)
- ✅ HttpSamlSigner
- ❌ LocalSamlSigner (excluded)

**xml-crypto references:** ❌ NONE

```bash
$ grep -i "xml-crypto" dist/core.mjs
# (no results)
```

**Dependencies:** Only core SAML functionality (fast-xml-parser, nanoid, oslo)

**Best for:**

- ✅ Cloudflare Workers
- ✅ Deno Deploy
- ✅ Vercel Edge Functions
- ✅ Any edge/browser environment
- ✅ When you want to use HTTP-based signing
- ✅ **Significantly smaller bundle size**

**Bundle savings:** **~200 KB minified (~54 KB gzipped)** compared to full import!

---

### 3. Local Signer Only (`@authhero/saml/local-signer`)

```typescript
import { LocalSamlSigner } from "@authhero/saml/local-signer";
```

**Files:**

- `dist/local-signer.mjs` - 1.2 KB (gzipped: ~0.6 KB)
- `dist/local-signer.cjs` - 1.3 KB (gzipped: ~0.7 KB)

**Contains:**

- ✅ LocalSamlSigner only

**xml-crypto references:** ✅ YES (required)

**Best for:** Importing only the signer when you already have other SAML utilities

---

## Key Differences

| Feature                     | Full Import    | Core Import ⭐ | Local Signer   |
| --------------------------- | -------------- | -------------- | -------------- |
| Package size (mjs)          | 65 KB          | 64 KB          | 1.2 KB         |
| **Bundled size (minified)** | **~305 KB** 🚨 | **~105 KB** ✅ | ~0.8 KB + deps |
| **Bundled size (gzipped)**  | **~82 KB**     | **~28 KB**     | ~0.6 KB + deps |
| xml-crypto dependency       | **YES** 🚨     | **NO** ✅      | **YES** 🚨     |
| HttpSamlSigner              | ✅             | ✅             | ❌             |
| LocalSamlSigner             | ✅             | ❌             | ✅             |
| Edge compatible             | **NO** 🚨      | **YES** ✅     | **NO** 🚨      |
| Node.js compatible          | Yes            | Yes            | Yes            |
| Dependencies size           | **~850 KB**    | Minimal        | **~850 KB**    |

**Bundle Size Comparison:**

```
┌─────────────────────────────────────────────────────┐
│ Full Import with xml-crypto:   305 KB (82 KB gz)   │ 🚨 3x larger!
├─────────────────────────────────────────────────────┤
│ Core Import (HTTP only):       105 KB (28 KB gz)   │ ✅ Recommended
└─────────────────────────────────────────────────────┘
     Savings: ~200 KB (~54 KB gzipped)
```

---

## Why Such a Big Difference?

The `xml-crypto` library and its dependencies are **HEAVY**:

```
xml-crypto package breakdown:
├── xml-crypto@6.1.2        348 KB
├── @xmldom/xmldom@0.8.10   208 KB  (XML DOM implementation)
├── xpath@0.0.33            264 KB  (XPath queries)
└── @xmldom/is-dom-node     32 KB   (DOM utilities)
──────────────────────────────────
Total:                      ~850 KB unminified!
                            ~200 KB in final minified bundle
                            ~54 KB additional gzipped
```

These dependencies are necessary for local XML signing but:

- ❌ Don't work in edge/serverless environments (require Node.js crypto)
- ❌ Significantly increase bundle size
- ❌ Add complexity to your deployment

**Solution:** Use `HttpSamlSigner` and delegate signing to a dedicated service!

---

## Migration Guide

### From Full Import to Core Import (for Edge environments)

**Before:**

```typescript
import { createSamlResponse, HttpSamlSigner } from "@authhero/saml";
```

**After:**

```typescript
import { createSamlResponse, HttpSamlSigner } from "@authhero/saml/core";
```

**Benefits:**

- ✅ Removes all xml-crypto references from your bundle
- ✅ **~200 KB smaller bundle size**
- ✅ **~54 KB smaller gzipped size**
- ✅ No Node.js native module compatibility issues
- ✅ Works in all edge environments

---

## Real-World Bundle Test

We tested actual bundle sizes using esbuild:

```bash
# Test 1: Core import only (no xml-crypto)
npx esbuild dist/core.mjs --bundle --minify --format=esm
Result: 105 KB minified, 28 KB gzipped ✅

# Test 2: Full import with xml-crypto
npx esbuild dist/saml.mjs --bundle --minify --format=esm --platform=node
Result: 305 KB minified, 82 KB gzipped 🚨

Difference: 200 KB (54 KB gzipped) - 3x larger!
```

---

## Verification

### Check for xml-crypto in your bundle:

```bash
# Should have NO results when using core import
grep -r "xml-crypto" dist/

# Or check specific bundle
grep -i "xml-crypto" node_modules/@authhero/saml/dist/core.mjs
```

### Example authhero package usage:

```typescript
// packages/authhero/src/strategies/saml.ts
import { createSamlResponse, HttpSamlSigner } from "@authhero/saml/core";

// This ensures authhero package has NO xml-crypto imports
// Perfect for edge deployments
```

---

## Recommendation

**For edge/Cloudflare Workers environments:**

- ✅ Use `@authhero/saml/core` or `authhero` (which imports from core)
- ✅ Use `HttpSamlSigner` to delegate signing to a microservice
- ✅ Save ~200 KB in bundle size
- ✅ Avoid Node.js compatibility issues

**For Node.js environments with local signing:**

- Use `@authhero/saml` or `@authhero/saml/local-signer`
- ⚠️ Accept the ~200 KB bundle size increase
- ✅ No external signing service needed

**For custom implementations:**

- Import only what you need from the appropriate entry point
- Consider implementing a custom `SamlSigner` if you have specific requirements

---

## Summary

The separation of SAML into different entry points provides **real, measurable benefits**:

1. **Core Import (`@authhero/saml/core`):**

   - 105 KB minified (28 KB gzipped)
   - No xml-crypto dependency
   - Edge/serverless compatible
   - ⭐ **Recommended for most users**

2. **Full Import (`@authhero/saml`):**
   - 305 KB minified (82 KB gzipped)
   - Includes xml-crypto + dependencies
   - Node.js only
   - Only needed if you MUST sign locally

**Bottom line:** Using HTTP-based signing saves you **~200 KB (~54 KB gzipped)** and makes your code edge-compatible! 🚀
