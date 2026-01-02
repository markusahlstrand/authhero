---
title: SAML Migration Guide
description: Migrate to the @authhero/saml package with backward compatibility. Configure HTTP-based signing for edge environments or local signing for Node.js.
---

# SAML Migration Guide

This guide helps you migrate to the new `@authhero/saml` package and understand the changes in SAML configuration.

## What Changed?

SAML functionality has been extracted from the `authhero` core package into a separate `@authhero/saml` package. This provides:

- ✅ Better support for edge/serverless environments
- ✅ Smaller bundle sizes when SAML isn't needed
- ✅ Flexible signing strategies (local or HTTP-based)
- ✅ Runtime configuration of SAML signers

## Breaking Changes

### None! 🎉

The migration is **backward compatible**. Existing code using `SAML_SIGN_URL` environment variable continues to work without changes.

## Migration Paths

### Option 1: No Changes Required (Environment Variable)

If you're using the `SAML_SIGN_URL` environment variable, nothing needs to change:

```typescript
// Before (still works!)
import { init } from 'authhero';

const app = init({ dataAdapter });
// Uses SAML_SIGN_URL automatically
```

### Option 2: Explicit Configuration (Recommended)

For better control, pass a signer instance:

```typescript
// After (recommended)
import { init, HttpSamlSigner } from 'authhero';

const app = init({
  dataAdapter,
  samlSigner: new HttpSamlSigner('https://signing-service.com/sign')
});
```

### Option 3: Local Signing (Node.js)

If you were relying on local signing behavior:

```typescript
// After (Node.js only)
import { init } from 'authhero';
import { LocalSamlSigner } from '@authhero/saml/local-signer';

const app = init({
  dataAdapter,
  samlSigner: new LocalSamlSigner()
});
```

## Bundle Size Improvements

### Before (All Imports)

```typescript
import { init } from 'authhero';
// Bundle: ~65 KB (includes xml-crypto)
```

### After (HTTP-Based Only)

```typescript
import { init, HttpSamlSigner } from 'authhero';
// Bundle: ~64 KB (NO xml-crypto)
```

### After (Local Signing)

```typescript
import { init } from 'authhero';
import { LocalSamlSigner } from '@authhero/saml/local-signer';
// Bundle: ~64 KB + xml-crypto (same as before)
```

## New Features

### 1. Runtime Configuration

You can now change the SAML signer at runtime:

```typescript
const httpSigner = new HttpSamlSigner('https://signing-service.com/sign');
const localSigner = new LocalSamlSigner();

// Use different signers based on environment
const signer = process.env.NODE_ENV === 'production' 
  ? httpSigner 
  : localSigner;

const app = init({
  dataAdapter,
  samlSigner: signer
});
```

### 2. Custom Signers

Implement custom signing logic:

```typescript
import type { SamlSigner } from 'authhero';

class MyCustomSigner implements SamlSigner {
  async signSAML(xml: string): Promise<string> {
    // Your custom logic
    return signedXml;
  }
}

const app = init({
  dataAdapter,
  samlSigner: new MyCustomSigner()
});
```

### 3. Signer Composition

Wrap signers with additional functionality:

```typescript
import { HttpSamlSigner } from 'authhero';

class RetrySigner implements SamlSigner {
  constructor(private inner: SamlSigner) {}
  
  async signSAML(xml: string): Promise<string> {
    // Retry logic
    return await this.inner.signSAML(xml);
  }
}

const baseSigner = new HttpSamlSigner('https://signing-service.com/sign');
const retrySigner = new RetrySigner(baseSigner);

const app = init({
  dataAdapter,
  samlSigner: retrySigner
});
```

## Edge/Serverless Deployment

### Cloudflare Workers

```typescript
// wrangler.toml
# SAML_SIGN_URL = "https://signing-service.com/sign"

import { init } from 'authhero';
import { createCloudflareAdapter } from '@authhero/cloudflare';

export default {
  async fetch(request: Request, env: Env) {
    const dataAdapter = createCloudflareAdapter(env);
    
    // Automatically uses HttpSamlSigner
    const { app } = init({ dataAdapter });
    
    return app.fetch(request, env);
  }
};
```

### Vercel Edge Functions

```typescript
import { init, HttpSamlSigner } from 'authhero';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const { app } = init({
    dataAdapter,
    samlSigner: new HttpSamlSigner(process.env.SAML_SIGN_URL!)
  });
  
  return app.fetch(req);
}
```

## Direct Package Usage

If you were importing SAML utilities directly, update imports:

### Before

```typescript
import { createSamlResponse } from 'authhero';
```

### After

```typescript
import { createSamlResponse } from '@authhero/saml';
```

## TypeScript Types

SAML types are now exported from both packages:

```typescript
// From main package (recommended)
import type { SamlSigner } from 'authhero';

// Or from SAML package directly
import type { 
  SamlSigner, 
  SAMLRequest, 
  SAMLResponseJSON 
} from '@authhero/saml';
```

## Testing

### Mock Signer for Tests

```typescript
import type { SamlSigner } from 'authhero';

class MockSigner implements SamlSigner {
  async signSAML(xml: string): Promise<string> {
    return xml; // Return unsigned for tests
  }
}

// In tests
const app = init({
  dataAdapter: mockAdapter,
  samlSigner: new MockSigner()
});
```

## Troubleshooting

### "Cannot find module '@authhero/saml'"

The `@authhero/saml` package is installed automatically as a dependency of `authhero`. If you see this error:

```bash
pnpm install authhero
# or
npm install authhero
```

### "xml-crypto not found" in Edge Environment

You're trying to use `LocalSamlSigner` in an edge environment. Use `HttpSamlSigner` instead:

```typescript
// Don't do this in edge environments
import { LocalSamlSigner } from '@authhero/saml/local-signer';

// Do this instead
import { HttpSamlSigner } from 'authhero';
const signer = new HttpSamlSigner(env.SAML_SIGN_URL);
```

### Bundle Size Still Large

Make sure you're not importing from the wrong entry point:

```typescript
// ❌ Wrong - includes LocalSamlSigner
import { HttpSamlSigner } from '@authhero/saml';

// ✅ Correct - no xml-crypto
import { HttpSamlSigner } from 'authhero';
// or
import { HttpSamlSigner } from '@authhero/saml/core';
```

## Getting Help

- [SAML Package Documentation](/packages/saml/)
- [SAML Configuration Guide](/packages/saml/configuration)
- [Custom Signers Guide](/packages/saml/custom-signers)
- [GitHub Issues](https://github.com/markusahlstrand/authhero/issues)
