# SAML Configuration

The SAML package supports flexible configuration options for different deployment environments.

## Configuration Options

There are three ways to configure SAML signing, listed in priority order:

### 1. Pass Signer Instance (Recommended)

Pass a `SamlSigner` instance directly to the `init()` function for full control:

```typescript
import { init, HttpSamlSigner } from "authhero";

const app = init({
  dataAdapter,
  samlSigner: new HttpSamlSigner("https://signing-service.com/sign"),
});
```

### 2. Environment Variable

Set the `SAML_SIGN_URL` environment variable:

```bash
SAML_SIGN_URL=https://signing-service.com/sign
```

```typescript
import { init } from "authhero";

// Will automatically use HttpSamlSigner with SAML_SIGN_URL
const app = init({ dataAdapter });
```

### 3. No Signing

If SAML signing is not required:

```typescript
import { init } from "authhero";

const app = init({ dataAdapter });
// SAML responses will be created without signatures
```

## Signer Implementations

### HttpSamlSigner (Edge Compatible)

Delegates signing to an HTTP endpoint. Ideal for edge/serverless environments:

```typescript
import { HttpSamlSigner } from "authhero";

const signer = new HttpSamlSigner("https://signing-service.com/sign");
```

**Constructor Parameters:**

- `url` (string) - The HTTP endpoint that will sign SAML responses

**Endpoint Requirements:**

The HTTP endpoint should:

- Accept POST requests with XML in the body
- Return signed XML in the response
- Use appropriate error status codes

Example signing endpoint:

```typescript
// Signing service endpoint
app.post("/sign", async (c) => {
  const xml = await c.req.text();

  try {
    const signedXml = await signSamlResponse(xml);
    return c.text(signedXml);
  } catch (error) {
    return c.text("Signing failed", 500);
  }
});
```

### LocalSamlSigner (Node.js Only)

Uses the `xml-crypto` library for local signing. Only works in Node.js environments:

```typescript
import { LocalSamlSigner } from "@authhero/saml/local-signer";

const signer = new LocalSamlSigner();
```

::: warning Node.js Only
`LocalSamlSigner` requires Node.js crypto APIs and cannot run in edge/serverless environments like Cloudflare Workers.
:::

::: tip Bundle Size
Importing `LocalSamlSigner` adds the `xml-crypto` dependency and its transitive dependencies to your bundle, increasing it by **~200 KB** (~54 KB gzipped). If you only need HTTP-based signing, use `HttpSamlSigner` to keep your bundle 3x smaller.
:::

## Custom Signer Implementation

You can implement custom signing logic by implementing the `SamlSigner` interface:

```typescript
import type { SamlSigner } from "authhero";

class MyCustomSigner implements SamlSigner {
  async signSAML(xml: string): Promise<string> {
    // Your custom signing implementation
    const signedXml = await yourSigningLogic(xml);
    return signedXml;
  }
}

const app = init({
  dataAdapter,
  samlSigner: new MyCustomSigner(),
});
```

See [Custom Signers](./custom-signers.md) for detailed examples.

## Priority Resolution

When determining which signer to use, AuthHero follows this priority:

1. **Custom instance** passed to `init()` config (highest priority)
2. **SAML_SIGN_URL** environment variable
3. **undefined** (no signing)

```typescript
// Priority 1: Explicit configuration (highest)
const app = init({
  dataAdapter,
  samlSigner: new MyCustomSigner(), // ✅ This is used
});

// Priority 2: Environment variable
// SAML_SIGN_URL=https://example.com/sign
const app = init({
  dataAdapter,
  // ✅ Uses HttpSamlSigner with SAML_SIGN_URL
});

// Priority 3: No signing
const app = init({
  dataAdapter,
  // ✅ SAML responses created without signatures
});
```

## Bundle Optimization

The package provides multiple entry points to optimize your bundle size.

::: warning xml-crypto Impact
The `xml-crypto` dependency and its transitive dependencies add **~200 KB** to your final bundle (82 KB gzipped). This is a significant increase that can be avoided by using HTTP-based signing.
:::

### Real Bundle Sizes

| Entry Point                   | Minified Size  | Gzipped | Dependencies Included               |
| ----------------------------- | -------------- | ------- | ----------------------------------- |
| `authhero` (uses core)        | **~105 KB** ✅ | ~28 KB  | fast-xml-parser, nanoid, oslo       |
| `@authhero/saml/core`         | **~105 KB** ✅ | ~28 KB  | fast-xml-parser, nanoid, oslo       |
| `@authhero/saml/local-signer` | **~305 KB** 🚨 | ~82 KB  | + xml-crypto, @xmldom/xmldom, xpath |
| `@authhero/saml` (full)       | **~305 KB** 🚨 | ~82 KB  | + xml-crypto, @xmldom/xmldom, xpath |

**Bundle savings using HTTP-based signing: ~200 KB minified (~54 KB gzipped) - 3x smaller!**

### Using Core Only (No xml-crypto) ⭐ Recommended

```typescript
// Option 1: From main package (recommended)
import { HttpSamlSigner } from "authhero";

// Option 2: Directly from core
import { HttpSamlSigner } from "@authhero/saml/core";
```

**Bundled Size:** ~105 KB minified (28 KB gzipped)

### Using Local Signer (Node.js Only)

```typescript
import { LocalSamlSigner } from "@authhero/saml/local-signer";
```

**Bundled Size:** ~305 KB minified (82 KB gzipped)
**Additional Dependencies:**

- xml-crypto (348 KB source)
- @xmldom/xmldom (208 KB source)
- xpath (264 KB source)
- @xmldom/is-dom-node (32 KB source)

### Bundle Size Comparison

```
┌────────────────────────────────────────────┐
│ HTTP-based signing:  105 KB (28 KB gz) ✅ │
├────────────────────────────────────────────┤
│ Local signing:       305 KB (82 KB gz) 🚨  │
└────────────────────────────────────────────┘
                  3x size difference!
```

### Import Comparison

| Import                        | Bundled Size  | Use Case                                        |
| ----------------------------- | ------------- | ----------------------------------------------- |
| `authhero`                    | **105 KB** ✅ | Edge/serverless with HTTP signing (recommended) |
| `@authhero/saml/core`         | **105 KB** ✅ | Direct core usage, no xml-crypto                |
| `@authhero/saml/local-signer` | **305 KB** 🚨 | Node.js with local signing only                 |
| `@authhero/saml`              | **305 KB** 🚨 | Full package (includes LocalSigner)             |

::: tip Recommendation
For edge/serverless deployments, use `HttpSamlSigner` (included in main package) to:

- ✅ Save ~200 KB in bundle size
- ✅ Avoid Node.js-specific dependencies
- ✅ Work in all environments

For Node.js deployments where you need local signing:

- Import from `@authhero/saml/local-signer`
- Accept the ~200 KB bundle increase
- Requires Node.js crypto APIs
  :::

## Environment Variables Reference

| Variable            | Description                             | Required |
| ------------------- | --------------------------------------- | -------- |
| `SAML_SIGN_URL`     | HTTP endpoint for SAML signing          | No       |
| `ORGANIZATION_NAME` | Organization name for SAML certificates | Yes      |
| `AUTH_URL`          | Base URL for authentication endpoints   | Yes      |
| `ISSUER`            | Issuer identifier for SAML assertions   | Yes      |

## Examples

### Edge Deployment (Cloudflare Workers)

```typescript
// wrangler.toml or environment config
// SAML_SIGN_URL = "https://signing-service.com/sign"

import { init } from "authhero";
import { createCloudflareAdapter } from "@authhero/cloudflare";

export default {
  async fetch(request: Request, env: Env) {
    const dataAdapter = createCloudflareAdapter(env);

    // Automatically uses HttpSamlSigner with SAML_SIGN_URL
    const { app } = init({ dataAdapter });

    return app.fetch(request, env);
  },
};
```

### Node.js Deployment

```typescript
import { init } from "authhero";
import { LocalSamlSigner } from "@authhero/saml/local-signer";
import { createKyselyAdapter } from "@authhero/kysely";

const dataAdapter = createKyselyAdapter(db);

const { app } = init({
  dataAdapter,
  samlSigner: new LocalSamlSigner(),
});

serve({ fetch: app.fetch, port: 3000 });
```

### Hybrid: Remote Signing Service

```typescript
import { init, HttpSamlSigner } from "authhero";

// Use a dedicated signing microservice
const { app } = init({
  dataAdapter,
  samlSigner: new HttpSamlSigner("https://internal-signing-service/sign"),
});
```
