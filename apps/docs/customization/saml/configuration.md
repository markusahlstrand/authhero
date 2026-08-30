---
title: SAML Configuration
description: Configure SAML signing in AuthHero using signer instances, environment variables, or HttpSamlSigner for edge-compatible HTTP-based signing.
---

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
  async signSAML(
    xmlContent: string,
    privateKey: string,
    publicCert: string,
  ): Promise<string> {
    // Your custom signing implementation
    const signedXml = await yourSigningLogic(
      xmlContent,
      privateKey,
      publicCert,
    );
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

```text
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
| `ORGANIZATION_NAME` | Organization name for SAML certificates | No       |
| `AUTH_URL`          | Base URL for authentication endpoints   | Yes      |
| `ISSUER`            | Issuer identifier for SAML assertions   | Yes      |

`ORGANIZATION_NAME` only supplies the certificate subject (`CN=…`) when a key is minted. It is optional: the name falls back through `ORGANIZATION_NAME` → the tenant id (for a tenant-scoped key) → the literal `authhero`. Setting it is still recommended, because the subject is what an administrator on the service-provider side sees when they inspect the certificate you send them.

## Certificate lifecycle

SAML certificates are managed through the Management API's signing-key routes with `?type=saml_encryption`. That query parameter selects the key bucket; every route defaults to `jwt_signing`, so it must be passed explicitly for SAML.

SAML keys are **always tenant-scoped**, whatever the deployment's `signingKeyMode` is. A tenant's own certificate is preferred for signing, and the shared control-plane certificate is used only as a fallback while a tenant key is being provisioned. This is deliberate: each certificate is published in that tenant's IdP metadata and pinned by that tenant's service providers, so a shared certificate could not be rotated without forcing every unrelated tenant's SPs to re-trust at the same moment. A control-plane certificate that a tenant merely inherits comes back flagged `inherited: true` and the mutating routes refuse it.

The default validity for a SAML certificate is **five years** (JWT signing keys default to one year). Every route below accepts `validity_days` (1–3650) to override it.

### Inspecting

```http
GET /api/v2/keys/signing?type=saml_encryption
GET /api/v2/keys/signing/{kid}?type=saml_encryption
```

Requires `read:signing_keys`. Private key material is never returned. Each entry carries `expires_at` and `expired` read off the certificate itself, `current` for the key that is actually signing, `next` for a staged key, and `inherited` for a key the tenant does not own.

### Rotating

```http
POST /api/v2/keys/signing/rotate?type=saml_encryption&activate_in_days=7&grace_days=7
```

Requires `create:signing_keys`. Rotation mints a **new key pair**, so the `kid` and the public key change.

- `activate_in_days` (default `0`) — publish the new certificate now but only start signing with it after this many days. This is the mechanism that makes a zero-downtime rotation possible for SAML: a service provider cannot discover a new certificate on its own, so the new `KeyDescriptor` is published in `/samlp/metadata/{client_id}` **immediately** while the outgoing key keeps signing, giving you a window to deliver the new certificate out-of-band. Doing it the other way round breaks every login in between. The admin console defaults to 7 days for SAML.
- `grace_days` (default `1`) — how long the outgoing certificate stays valid. The clock runs from **activation**, not from now, so a staged rotation cannot retire the old key before the new one takes over. During the grace period both certificates appear in the metadata, so an SP will accept assertions from either.

### Renewing

```http
POST /api/v2/keys/signing/{kid}/renew?type=saml_encryption
```

Requires `create:signing_keys`. Renewal re-issues the certificate over the **existing key pair**: the public key is unchanged, so the `kid` and the signature-verification path stay the same and only the certificate's validity window moves.

This is the escape hatch for a service provider that pins the certificate bytes and cannot be updated on your schedule. An SP that trusts the public key or the `kid` needs to do nothing at all; only an SP comparing the certificate itself has to be handed the re-issued one. Prefer `rotate` when you can — renewal keeps the same key material, so it does not help if that material is what you are trying to replace.

### Revoking

```http
PUT /api/v2/keys/signing/{kid}/revoke?type=saml_encryption
```

Requires `update:signing_keys`. Revokes the key immediately and mints a replacement in the same scope. There is no staging window, so an SP that pins the certificate will fail until it has the replacement — use `rotate` with `activate_in_days` unless you are responding to a compromise.

### Admin console

All of the above is available in the admin console under **Signing Keys → SAML**, including the certificate in the form an SP needs and a rotation dialog pre-filled with the SAML defaults.

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
