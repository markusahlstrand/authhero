# @authhero/saml

SAML utilities for AuthHero, including SAML request/response parsing, metadata generation, and signing capabilities.

## Features

- Parse SAML requests
- Generate SAML metadata
- Create SAML responses
- Pluggable signing implementations:
  - Local signing with xml-crypto (Node.js only)
  - HTTP-based signing for edge/browser environments

## Installation

```bash
npm install @authhero/saml
```

## Usage

# @authhero/saml

SAML utilities for AuthHero, including SAML request/response parsing, metadata generation, and signing capabilities.

## Features

- Parse SAML requests
- Generate SAML metadata
- Create SAML responses
- Pluggable signing implementations:
  - Local signing with xml-crypto (Node.js only)
  - HTTP-based signing for edge/browser environments

## Installation

```bash
npm install @authhero/saml
```

For local signing (Node.js), also install xml-crypto:

```bash
npm install xml-crypto
```

## Import Strategies

The package provides **three import paths** to optimize bundle size:

### 1. Full Import (All Features)

Includes everything including `LocalSamlSigner`. Use this for Node.js environments where you want local signing.

```typescript
import {
  createSamlResponse,
  LocalSamlSigner,
  HttpSamlSigner,
} from "@authhero/saml";
```

**Bundle impact:** Includes reference to xml-crypto (even with dynamic import)

### 2. Core Import (Edge-Optimized, **Recommended for Edge/Cloudflare Workers**)

Excludes `LocalSamlSigner` to avoid any xml-crypto imports. Perfect for edge environments.

```typescript
import { createSamlResponse, HttpSamlSigner } from "@authhero/saml/core";
```

**Bundle impact:** ✅ No xml-crypto imports, smaller bundle

### 3. Local Signer Only

Import only the local signer when needed.

```typescript
import { LocalSamlSigner } from "@authhero/saml/local-signer";
```

## Usage Examples

### Edge Environment (HTTP Signer) - **Recommended**

```typescript
import { createSamlResponse, HttpSamlSigner } from "@authhero/saml/core";

const signer = new HttpSamlSigner("https://your-signing-service.com/sign");

const response = await createSamlResponse(
  {
    issuer: "https://example.com",
    audience: "urn:example:audience",
    destination: "https://sp.example.com/acs",
    inResponseTo: "request-id",
    userId: "user-123",
    email: "user@example.com",
    sessionIndex: "session-123",
    signature: {
      privateKeyPem: "-----BEGIN PRIVATE KEY-----...",
      cert: "-----BEGIN CERTIFICATE-----...",
      kid: "key-id",
    },
  },
  signer,
);
```

**Benefits:**

- ✅ Works in Cloudflare Workers, Deno Deploy, Vercel Edge
- ✅ No heavy xml-crypto dependency
- ✅ Smaller bundle size
- ✅ No Node.js native dependencies

### Node.js Environment (Local Signer)

```typescript
import { createSamlResponse, LocalSamlSigner } from "@authhero/saml";

const signer = new LocalSamlSigner();

const response = await createSamlResponse(
  {
    // ... same params as above
  },
  signer,
);
```

### HTTP Signer for Edge Environments

```typescript
import { createSamlResponse, HttpSamlSigner } from "@authhero/saml";

const signer = new HttpSamlSigner("https://your-signing-service.com/sign");

const response = await createSamlResponse(
  {
    // ... same params as above
  },
  signer,
);
```

### Custom Signer Implementation

```typescript
import { SamlSigner } from "@authhero/saml";

class CustomSamlSigner implements SamlSigner {
  async signSAML(
    xmlContent: string,
    privateKey: string,
    publicCert: string,
  ): Promise<string> {
    // Your custom signing logic
    return signedXml;
  }
}
```

## License

MIT
