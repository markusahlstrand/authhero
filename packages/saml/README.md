# @authhero/saml

A dedicated SAML (Security Assertion Markup Language) package for AuthHero that provides SAML Identity Provider (IdP) functionality.

## Overview

This package contains SAML-specific functionality that was separated from the main `authhero` package to address bundle size and runtime compatibility concerns. It provides tools for creating SAML metadata, generating SAML responses, and parsing SAML requests.

## Why a Separate Package?

### 1. **Bundle Size Optimization**

The SAML functionality includes heavy dependencies:

- `@peculiar/x509` - X.509 certificate handling (~200KB)
- `xml-crypto` - XML digital signatures (~150KB)
- `fast-xml-parser` - XML parsing (~100KB)

By separating SAML into its own package, applications that don't need SAML functionality can avoid these dependencies, reducing bundle size by **~400-500KB**.

### 2. **Cloudflare Worker Compatibility**

**Critical**: The `xml-crypto` dependency relies on Node.js's native `crypto` module, which is **not available in Cloudflare Workers**.

If your main AuthHero application runs on Cloudflare Workers, you **cannot** use this SAML package directly. Instead, you need to:

1. Deploy the SAML functionality to a **separate Node.js environment** (e.g., Vercel, Railway, or traditional server)
2. Expose SAML endpoints from that Node.js service
3. Proxy SAML requests from your Cloudflare Worker to the Node.js service

## Installation

```bash
npm install @authhero/saml
# or
pnpm add @authhero/saml
# or
yarn add @authhero/saml
```

## Usage

### Basic SAML Metadata Generation

```typescript
import { createSamlMetadata } from "@authhero/saml";

const metadata = createSamlMetadata({
  entityId: "https://your-domain.com",
  assertionConsumerServiceUrl: "https://your-domain.com/saml/acs",
  singleLogoutServiceUrl: "https://your-domain.com/saml/sls",
  certificates: ["your-x509-certificate-string"],
});

console.log(metadata); // Returns XML metadata
```

### SAML Response Generation

```typescript
import { createSamlResponse } from "@authhero/saml";

const response = await createSamlResponse({
  destination: "https://sp.example.com/saml/acs",
  inResponseTo: "_request-id",
  audience: "https://sp.example.com",
  issuer: "https://your-idp.com",
  email: "user@example.com",
  userId: "user-123",
  sessionIndex: "session-456",
});
```

### Parsing SAML Requests

```typescript
import { parseSamlRequestQuery } from "@authhero/saml";

// Parse a base64-encoded SAML request
const parsedRequest = await parseSamlRequestQuery(samlRequestBase64);
console.log(parsedRequest);
```

## Architecture Patterns

### Pattern 1: Node.js Only Deployment

If your entire application runs in Node.js, you can use this package directly:

```typescript
import { init } from "authhero";
import { createSamlMetadata, createSamlResponse } from "@authhero/saml";

const app = init(config);
// Use SAML functions directly
```

### Pattern 2: Cloudflare + Node.js Hybrid

For Cloudflare Worker deployments, set up a separate Node.js service:

**Node.js SAML Service:**

```typescript
import { Hono } from "hono";
import { createSamlMetadata, createSamlResponse } from "@authhero/saml";

const app = new Hono();

app.get("/saml/metadata", async (c) => {
  const metadata = createSamlMetadata({
    // ... config
  });
  return c.text(metadata, 200, {
    "Content-Type": "application/xml",
  });
});

app.post("/saml/response", async (c) => {
  const body = await c.req.json();
  const response = await createSamlResponse(body);
  return c.json({ response });
});

export default app;
```

**Cloudflare Worker (Proxy):**

```typescript
import { init } from "authhero";

const app = init(config);

app.get("/saml/*", async (c) => {
  // Proxy SAML requests to Node.js service
  const response = await fetch(`${SAML_SERVICE_URL}${c.req.path}`, {
    method: c.req.method,
    headers: c.req.headers,
    body: c.req.body,
  });
  return response;
});
```

## API Reference

### `createSamlMetadata(params)`

Creates SAML IdP metadata XML.

**Parameters:**

- `entityId` (string): Unique identifier for your IdP
- `assertionConsumerServiceUrl` (string): URL where SAML assertions are sent
- `singleLogoutServiceUrl` (string): URL for logout requests
- `certificates` (string[]): Array of X.509 certificate strings

**Returns:** XML string containing SAML metadata

### `createSamlResponse(params)`

Generates a SAML response for authentication.

**Parameters:**

- `destination` (string): Target URL for the response
- `inResponseTo` (string): ID of the original SAML request
- `audience` (string): Intended audience (usually SP entity ID)
- `issuer` (string): Your IdP entity ID
- `email` (string): User's email address
- `userId` (string): Unique user identifier
- `sessionIndex` (string): Session identifier
- `signature` (optional): Signing configuration for response signing

**Returns:** Promise<string> - Base64 encoded SAML response

### `parseSamlRequestQuery(query)`

Parses and validates a SAML authentication request.

**Parameters:**

- `query` (string): Base64-encoded SAML request

**Returns:** Promise<object> - Parsed and validated SAML request object

## Dependencies

This package includes the following major dependencies:

- `@peculiar/x509` - X.509 certificate operations
- `xml-crypto` - XML digital signature support ⚠️ **Node.js only**
- `fast-xml-parser` - XML parsing and building
- `oslo` - Cryptographic utilities
- `nanoid` - ID generation

## Environment Compatibility

| Environment         | Compatible | Notes                              |
| ------------------- | ---------- | ---------------------------------- |
| Node.js             | ✅ Yes     | Full support                       |
| Cloudflare Workers  | ❌ No      | Use proxy pattern                  |
| Vercel Edge Runtime | ❌ No      | Use serverless functions           |
| Deno                | ❌ No      | Node.js crypto dependency          |
| Bun                 | ✅ Partial | May work but not officially tested |

## Contributing

This package is part of the AuthHero monorepo. See the main repository for contribution guidelines.

## License

MIT - See the main AuthHero repository for license details.
