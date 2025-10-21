# SAML Bundle Size Analysis - Key Findings

## The Question

> "I'm guessing that the bundle comparison doesn't take the xml-crypto dependency into consideration? In order to run it in process this is needed right? And it will increase the bundle size quite a bit?"

## The Answer

**YES! You're absolutely right.** The initial bundle comparison only looked at the `@authhero/saml` package files themselves (64-65 KB), but didn't account for the massive xml-crypto dependency chain.

## Real Bundle Sizes

### With xml-crypto (LocalSamlSigner)

```
Package file:   65 KB
+ xml-crypto:   348 KB (source)
+ @xmldom:      208 KB (source)
+ xpath:        264 KB (source)
+ utilities:    32 KB (source)
═══════════════════════════════
Total source:   ~917 KB
Bundled:        ~305 KB minified
Gzipped:        ~82 KB
```

### Without xml-crypto (HttpSamlSigner only)

```
Package file:   64 KB
Dependencies:   Minimal (fast-xml-parser, nanoid, oslo)
═══════════════════════════════
Bundled:        ~105 KB minified
Gzipped:        ~28 KB
```

## The Impact

**Bundle size increase: ~200 KB minified (~54 KB gzipped) - 3x larger!**

```
┌─────────────────────────────────────────────────────┐
│ WITH xml-crypto:    305 KB (82 KB gz)              │ 🚨 3x larger
├─────────────────────────────────────────────────────┤
│ WITHOUT xml-crypto: 105 KB (28 KB gz)              │ ✅ Recommended
└─────────────────────────────────────────────────────┘
```

## Why xml-crypto is So Heavy

The `xml-crypto` package requires:

1. **@xmldom/xmldom** - Full XML DOM implementation for Node.js
2. **xpath** - XPath query engine for traversing XML
3. **@xmldom/is-dom-node** - DOM node utilities
4. **Native crypto APIs** - Node.js crypto module for signing

These are all necessary for local XML signature verification and signing, but:

- ❌ Don't work in edge/serverless environments
- ❌ Significantly increase bundle size
- ❌ Require Node.js runtime

## The Solution

We created **three separate entry points** to give you choice:

### 1. `@authhero/saml/core` (Recommended)

- ✅ No xml-crypto dependency
- ✅ 105 KB bundled (28 KB gzipped)
- ✅ Edge/serverless compatible
- ✅ Use `HttpSamlSigner` to delegate signing

### 2. `@authhero/saml` (Full)

- ⚠️ Includes xml-crypto
- 🚨 305 KB bundled (82 KB gzipped)
- ❌ Node.js only
- Use only if you MUST sign locally

### 3. `@authhero/saml/local-signer`

- Import only the LocalSamlSigner class
- Still requires xml-crypto
- Minimal overhead if you already have other imports

## Verification Test

We ran actual bundle tests with esbuild:

```bash
# Test 1: Core (no xml-crypto)
npx esbuild dist/core.mjs --bundle --minify --format=esm
→ 105 KB minified, 28 KB gzipped ✅

# Test 2: Full (with xml-crypto)
npx esbuild dist/saml.mjs --bundle --minify --format=esm --platform=node
→ 305 KB minified, 82 KB gzipped 🚨
```

## What This Means for Users

### For Edge/Serverless Deployments (Cloudflare Workers, Vercel Edge, Deno Deploy)

- ✅ Use `@authhero/saml/core` or `authhero` (which uses core)
- ✅ Use `HttpSamlSigner('https://signing-service.com/sign')`
- ✅ Save ~200 KB in bundle size
- ✅ No compatibility issues

### For Node.js Deployments

- **Option A:** Use `HttpSamlSigner` (recommended)
  - Still works in Node.js
  - Smaller bundle
  - Separation of concerns
- **Option B:** Use `LocalSamlSigner`
  - No external service needed
  - Accept the ~200 KB bundle increase
  - Import from `@authhero/saml/local-signer`

## The authhero Package Strategy

The main `authhero` package imports from `@authhero/saml/core`:

```typescript
// packages/authhero/src/strategies/saml.ts
import { createSamlResponse, HttpSamlSigner } from "@authhero/saml/core";
```

This means:

- ✅ The core `authhero` package has NO xml-crypto references
- ✅ Edge/serverless deployments work out of the box
- ✅ Users can opt-in to local signing if needed

## Recommendation

**Default to HTTP-based signing unless you have a specific reason not to:**

```typescript
// ✅ Recommended: Small bundle, edge-compatible
import { init, HttpSamlSigner } from "authhero";

const app = init({
  dataAdapter,
  samlSigner: new HttpSamlSigner("https://signing-service.com/sign"),
});
```

**Only use local signing if absolutely necessary:**

```typescript
// ⚠️ Only if needed: +200 KB bundle, Node.js only
import { init } from "authhero";
import { LocalSamlSigner } from "@authhero/saml/local-signer";

const app = init({
  dataAdapter,
  samlSigner: new LocalSamlSigner(),
});
```

## Summary

Your intuition was **100% correct**! The xml-crypto dependency adds significant size:

- 📦 **Package files alone**: 64-65 KB (misleading!)
- 🚨 **With xml-crypto dependencies**: ~305 KB bundled (~82 KB gzipped)
- ✅ **Without xml-crypto (core)**: ~105 KB bundled (~28 KB gzipped)
- 💰 **Savings**: ~200 KB minified (~54 KB gzipped) - **3x smaller!**

This is why we separated the package into multiple entry points - to give you the flexibility to choose based on your deployment environment and requirements.
