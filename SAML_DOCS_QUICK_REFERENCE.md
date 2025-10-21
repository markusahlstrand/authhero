# SAML Documentation Quick Reference

## 📖 New Documentation Pages

All documentation is accessible through the VitePress site at `/packages/saml/`:

### Main Pages

| Page                | URL                             | Content                                                            |
| ------------------- | ------------------------------- | ------------------------------------------------------------------ |
| **Overview**        | `/packages/saml/`               | Package introduction, features, installation, quick start          |
| **Configuration**   | `/packages/saml/configuration`  | All configuration options, signers, examples, deployment scenarios |
| **API Reference**   | `/packages/saml/api-reference`  | Complete API documentation for types, classes, and functions       |
| **Custom Signers**  | `/packages/saml/custom-signers` | Guide to implementing custom SAML signers with 5 examples          |
| **Migration Guide** | `/guides/saml-migration`        | How to migrate to the new SAML package                             |

## 🎯 Quick Links by Use Case

### "I want to get started with SAML"

→ Start here: `/packages/saml/` (Overview)
→ Then read: `/packages/saml/configuration` (Configuration)

### "I'm using SAML and need to upgrade"

→ Read: `/guides/saml-migration` (Migration Guide)
→ No changes needed if using `SAML_SIGN_URL` environment variable!

### "I need to implement a custom signer"

→ Read: `/packages/saml/custom-signers` (Custom Signers)
→ See 5 working examples: AWS KMS, Caching, Retry, Multi-Key, Monitoring

### "I need API documentation"

→ Read: `/packages/saml/api-reference` (API Reference)
→ Complete type, class, and function documentation

### "I'm deploying to Cloudflare Workers / Vercel Edge"

→ Read: `/packages/saml/configuration` → "Edge Deployment" section
→ Use `HttpSamlSigner` for edge compatibility

### "I want to optimize bundle size"

→ Read: `/packages/saml/configuration` → "Bundle Optimization" section
→ Use `HttpSamlSigner` to avoid xml-crypto (saves ~65 KB)

## 📋 Configuration Quick Reference

### Three Ways to Configure SAML Signing

```typescript
// 1. Pass signer instance (Recommended) - Highest Priority
import { init, HttpSamlSigner } from "authhero";
const app = init({
  dataAdapter,
  samlSigner: new HttpSamlSigner("https://signing-service.com/sign"),
});

// 2. Environment variable (Legacy) - Medium Priority
// SAML_SIGN_URL=https://signing-service.com/sign
const app = init({ dataAdapter });

// 3. No signing - Lowest Priority
const app = init({ dataAdapter });
```

## 🔧 Common Tasks

### Use HTTP-based signing (Edge Compatible)

```typescript
import { HttpSamlSigner } from "authhero";
const signer = new HttpSamlSigner("https://signing-service.com/sign");
```

**Docs:** `/packages/saml/configuration#httpsamlsigner-edge-compatible`

### Use Local signing (Node.js Only)

```typescript
import { LocalSamlSigner } from "@authhero/saml/local-signer";
const signer = new LocalSamlSigner();
```

**Docs:** `/packages/saml/configuration#localsamlsigner-nodejs-only`

### Implement custom signer

```typescript
import type { SamlSigner } from "authhero";
class MyCustomSigner implements SamlSigner {
  async signSAML(xml: string): Promise<string> {
    // Your logic here
  }
}
```

**Docs:** `/packages/saml/custom-signers`

### Parse SAML request

```typescript
import { parseSamlRequestQuery } from "@authhero/saml";
const request = parseSamlRequestQuery(query);
```

**Docs:** `/packages/saml/api-reference#parsesamlrequestquery`

### Create SAML response

```typescript
import { createSamlResponse } from "@authhero/saml";
const response = await createSamlResponse(params, signer);
```

**Docs:** `/packages/saml/api-reference#createsamlresponse`

### Generate SAML metadata

```typescript
import { createSamlMetadata } from "@authhero/saml";
const metadata = createSamlMetadata({ issuer, callbackUrl, certificate });
```

**Docs:** `/packages/saml/api-reference#createsamlmetadata`

## 🎓 Learning Paths

### Path 1: Quick Start (5 minutes)

1. `/packages/saml/` (Overview)
2. `/packages/saml/configuration` (Basic configuration)
3. Start coding!

### Path 2: Comprehensive (15 minutes)

1. `/packages/saml/` (Overview)
2. `/packages/saml/configuration` (All configuration)
3. `/packages/saml/api-reference` (API details)
4. `/packages/saml/custom-signers` (Advanced)

### Path 3: Migration (3 minutes)

1. `/guides/saml-migration` (Migration guide)
2. No changes if using `SAML_SIGN_URL`!

### Path 4: Advanced (20 minutes)

1. `/packages/saml/configuration` (Configuration)
2. `/packages/saml/custom-signers` (5 examples)
3. `/packages/saml/api-reference` (Deep dive)

## 📦 Package Entry Points

| Import                        | Bundle Size | Use Case                               |
| ----------------------------- | ----------- | -------------------------------------- |
| `authhero`                    | ~64 KB      | Main package, includes HttpSamlSigner  |
| `@authhero/saml`              | ~65 KB      | Full SAML package with LocalSamlSigner |
| `@authhero/saml/core`         | ~64 KB      | Core without xml-crypto                |
| `@authhero/saml/local-signer` | +xml-crypto | Only LocalSamlSigner                   |

**Docs:** `/packages/saml/configuration#bundle-optimization`

## 🚀 Deployment Scenarios

| Environment        | Recommended Signer                    | Documentation Link                                                |
| ------------------ | ------------------------------------- | ----------------------------------------------------------------- |
| Cloudflare Workers | `HttpSamlSigner`                      | `/packages/saml/configuration#edge-deployment-cloudflare-workers` |
| Vercel Edge        | `HttpSamlSigner`                      | `/packages/saml/configuration#vercel-edge-functions`              |
| Node.js Server     | `LocalSamlSigner` or `HttpSamlSigner` | `/packages/saml/configuration#nodejs-deployment`                  |
| AWS Lambda         | `HttpSamlSigner`                      | `/packages/saml/configuration`                                    |
| Docker/K8s         | `LocalSamlSigner` or `HttpSamlSigner` | `/packages/saml/configuration`                                    |

## 🔍 Common Questions

**Q: Do I need to make changes to my existing code?**
A: No! If you're using `SAML_SIGN_URL`, everything works without changes.
**Docs:** `/guides/saml-migration`

**Q: How do I reduce bundle size?**
A: Use `HttpSamlSigner` instead of `LocalSamlSigner` to avoid xml-crypto.
**Docs:** `/packages/saml/configuration#bundle-optimization`

**Q: Can I use SAML in edge environments?**
A: Yes! Use `HttpSamlSigner` which is edge-compatible.
**Docs:** `/packages/saml/configuration#httpsamlsigner-edge-compatible`

**Q: How do I implement custom signing logic?**
A: Implement the `SamlSigner` interface. See 5 examples in the docs.
**Docs:** `/packages/saml/custom-signers`

**Q: What if I need local signing in Node.js?**
A: Import `LocalSamlSigner` from `@authhero/saml/local-signer`.
**Docs:** `/packages/saml/configuration#localsamlsigner-nodejs-only`

## 🛠️ Troubleshooting

| Problem                               | Solution                                           | Docs Link                                |
| ------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| "Cannot find module '@authhero/saml'" | Run `pnpm install authhero`                        | `/guides/saml-migration#troubleshooting` |
| "xml-crypto not found" in edge        | Use `HttpSamlSigner` instead of `LocalSamlSigner`  | `/guides/saml-migration#troubleshooting` |
| Bundle size too large                 | Don't import from `@authhero/saml`, use `authhero` | `/guides/saml-migration#troubleshooting` |
| Need custom signing                   | Implement `SamlSigner` interface                   | `/packages/saml/custom-signers`          |

## 📞 Get Help

- 📚 [Full SAML Documentation](/packages/saml/)
- 🔧 [Configuration Guide](/packages/saml/configuration)
- 📖 [API Reference](/packages/saml/api-reference)
- 🎓 [Custom Signers Guide](/packages/saml/custom-signers)
- 🔄 [Migration Guide](/guides/saml-migration)
- 🐛 [GitHub Issues](https://github.com/markusahlstrand/authhero/issues)

## ✅ Build Status

- Documentation builds: ✅ **SUCCESSFUL**
- Dead links: ✅ **0**
- All pages generated: ✅ **YES**
- Build time: ✅ **7.30s**
