# @authhero/saml

The `@authhero/saml` package provides SAML authentication functionality for AuthHero. It supports both Node.js environments with local signing and edge/serverless environments with HTTP-based signing.

## Features

- 🔐 **SAML Request Parsing** - Parse and validate SAML authentication requests
- ✍️ **SAML Response Generation** - Create signed SAML responses
- 📄 **SAML Metadata** - Generate SAML service provider metadata
- 🔌 **Pluggable Signing** - Support for local (xml-crypto) or HTTP-based signing
- 🌍 **Edge Compatible** - Core functionality works in edge/serverless environments
- 📦 **Tree-shakeable** - Multiple entry points for optimal bundle size

## Installation

```bash
npm install @authhero/saml
# or
pnpm add @authhero/saml
# or
yarn add @authhero/saml
```

## Quick Start

### Using HTTP-Based Signing (Edge Compatible)

```typescript
import { init, HttpSamlSigner } from "authhero";

const app = init({
  dataAdapter,
  samlSigner: new HttpSamlSigner("https://signing-service.com/sign"),
});
```

### Using Local Signing (Node.js)

```typescript
import { init } from "authhero";
import { LocalSamlSigner } from "@authhero/saml/local-signer";

const app = init({
  dataAdapter,
  samlSigner: new LocalSamlSigner(),
});
```

## Documentation

- [Configuration](./configuration.md) - Configuration options and usage
- [API Reference](./api-reference.md) - Complete API documentation
- [Custom Signers](./custom-signers.md) - Implementing custom signing logic

## Package Structure

The package provides three entry points for optimal bundle size:

- **`@authhero/saml`** - Full package including LocalSamlSigner
- **`@authhero/saml/core`** - Core functionality without xml-crypto ⭐ **Recommended**
- **`@authhero/saml/local-signer`** - Only LocalSamlSigner class

### Real Bundle Sizes

| Entry Point                             | Bundled Size   | Gzipped | Dependencies                         |
| --------------------------------------- | -------------- | ------- | ------------------------------------ |
| `@authhero/saml` (with LocalSamlSigner) | **~305 KB** 🚨 | ~82 KB  | Includes xml-crypto (~850 KB source) |
| `@authhero/saml/core` (HTTP only)       | **~105 KB** ✅ | ~28 KB  | Minimal (fast-xml-parser, etc.)      |
| `@authhero/saml/local-signer`           | ~1 KB + deps   | ~0.6 KB | Requires xml-crypto                  |

**Bundle savings using core: ~200 KB minified (~54 KB gzipped) - 3x smaller!**

::: tip Bundle Optimization
The `xml-crypto` dependency and its transitive dependencies (@xmldom/xmldom, xpath) add **~200 KB** to your bundle.

Use `@authhero/saml/core` or import from the main `authhero` package to avoid this overhead and keep your edge/serverless deployments lightweight!
:::

::: warning xml-crypto Impact
If you use `LocalSamlSigner`, you'll pull in:

- xml-crypto (348 KB)
- @xmldom/xmldom (208 KB)
- xpath (264 KB)
- Other utilities (32 KB)

Total: **~850 KB** of source code, **~200 KB** in final minified bundle!
:::

## Why a Separate Package?

The SAML package was separated from the core AuthHero library to:

1. **Support Multiple Environments** - Enable both Node.js (with native crypto) and edge/serverless (HTTP-based signing)
2. **Reduce Bundle Size** - The `xml-crypto` library and its dependencies add **~200 KB** to your bundle - only include them when absolutely necessary
3. **Flexibility** - Allow choosing the signing strategy at runtime
4. **Tree-shaking** - Enable bundlers to eliminate unused code
5. **Edge Compatibility** - The core package works everywhere; xml-crypto requires Node.js

## Related Packages

- [@authhero/authhero](../authhero/) - Core authentication library
- [Database Adapters](../../adapters/) - Database adapter interfaces
