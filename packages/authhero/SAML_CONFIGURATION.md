# SAML Configuration Options

The SAML functionality now supports three ways to configure signing:

## 1. Pass a Signer Instance (Recommended)

This gives you full control over the signing implementation at initialization time:

```typescript
import { init, HttpSamlSigner } from "authhero";

// Option A: Use HTTP-based signing (for edge environments)
const app = init({
  dataAdapter,
  samlSigner: new HttpSamlSigner("https://signing-service.com/sign"),
});

// Option B: Use local signing (Node.js environments only)
import { LocalSamlSigner } from "@authhero/saml/local-signer";

const app = init({
  dataAdapter,
  samlSigner: new LocalSamlSigner(),
});
```

## 2. Environment Variable (Legacy)

Set the `SAML_SIGN_URL` environment variable:

```typescript
// This will automatically create an HttpSamlSigner
// SAML_SIGN_URL=https://signing-service.com/sign
const app = init({ dataAdapter });
```

## 3. No Signing

If you don't need SAML signing:

```typescript
const app = init({ dataAdapter });
// SAML responses will be created without signatures
```

## Priority

When determining which signer to use, the system follows this priority:

1. **Custom instance** passed to `init()` (highest priority)
2. **SAML_SIGN_URL** environment variable
3. **undefined** (no signing)

## Custom Signer Implementation

You can also implement your own signer by adhering to the `SamlSigner` interface:

```typescript
import type { SamlSigner } from "authhero";

class MyCustomSigner implements SamlSigner {
  async signSAML(xml: string): Promise<string> {
    // Your custom signing logic here
    return signedXml;
  }
}

const app = init({
  dataAdapter,
  samlSigner: new MyCustomSigner(),
});
```

## Bundle Size Optimization

To avoid including the heavy `xml-crypto` dependency in your bundle when using `HttpSamlSigner`:

- The main `authhero` package only imports from `@authhero/saml/core` (no xml-crypto)
- `HttpSamlSigner` is included in the core bundle (no extra dependencies)
- `LocalSamlSigner` must be imported separately: `import { LocalSamlSigner } from '@authhero/saml/local-signer'`

This means:

- ✅ Using `HttpSamlSigner` = **64 KB** (no xml-crypto)
- ⚠️ Using `LocalSamlSigner` = **64 KB + xml-crypto dependencies**
