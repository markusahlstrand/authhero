---
title: Signing-key certificates
description: Issue token-signing certificates from your own CA so a resource server can trust one root instead of a list of issuers.
---

# Signing-key certificates

By default every token-signing key carries a self-signed certificate. Nothing in the certificate links the key to a tenant, and the JWKS publishes only the public key.

That's fine while every tenant shares the control-plane keys: one JWKS covers everything. It breaks down with per-tenant keys and custom domains. A token's `iss` can be any tenant subdomain or custom domain, and a resource server can't safely fetch `${iss}/.well-known/jwks.json` for an arbitrary issuer. Anyone can host a JWKS on a domain they control. So today the resource server needs its own issuer → tenant registry, kept in sync with AuthHero's custom domains.

With a **signing certificate authority**, AuthHero issues each `jwt_signing` certificate from an intermediate CA you provide. The certificate names its owner in a SubjectAlternativeName URI, and the JWKS publishes the chain. A resource server pins one root and needs no registry.

## Configuration

```ts
import { init, createLocalCertificateIssuer } from "authhero";

const app = init({
  dataAdapter,
  signingCertificateAuthority: {
    issuer: createLocalCertificateIssuer({
      certificate: env.SIGNING_CA_CERT, // intermediate, PEM
      privateKey: env.SIGNING_CA_KEY, // intermediate's PKCS#8 key, PEM
    }),
    validityDays: 30, // default
  },
});
```

Keep the root offline. AuthHero only needs the intermediate.

`issuer` is any object that implements `CertificateIssuer`:

```ts
interface CertificateIssuer {
  // Certify a public key; returns the leaf certificate as PEM.
  issueCertificate(request: SigningCertificateRequest): Promise<string>;
  // Every intermediate that may have signed a still-published leaf.
  getIssuerCertificates(): Promise<string[]>;
}
```

The request is plain data: an SPKI public-key PEM, the subject, the SAN URI and the validity window. That means an issuer can forward it to a separate service, so the CA key never has to live in the auth worker. AuthHero generates the key pair itself and only ever sends the public key. It also checks that the returned certificate is for that key.

When you rotate the intermediate, list the old one in `previousCertificates` until the leaves it signed have been rotated or renewed. Otherwise those keys are published without a chain.

## What gets issued

Each leaf certificate has:

- **`BasicConstraints`** CA=false, and **`KeyUsage`** digitalSignature only.
- **A SAN URI naming the owner.** Tenant keys get `urn:authhero:tenant:<tenant_id>`, and control-plane keys get `urn:authhero:control-plane`. The certificate holds no hostnames, so adding or removing a custom domain never requires a new certificate.
- **A short lifetime,** 30 days by default. Renewing keeps the key pair, so the `kid` stays the same and tokens that were already issued keep verifying.

Set `subjectUri` to change the SAN. For example, a WFP tenant worker stores its own keys without a `tenant_id`, so it has to name its tenant explicitly:

```ts
signingCertificateAuthority: {
  issuer,
  subjectUri: () => `urn:authhero:tenant:${TENANT_ID}`,
}
```

SAML keys are never CA-issued. Service providers pin SAML certificates for years and don't use the chain.

The JWKS entry for a CA-issued key gets:

- `x5c`: the leaf and its intermediate, as base64 DER, leaf first (RFC 7517 §4.7).
- `x5t#S256`: the SHA-256 thumbprint of the leaf.

AuthHero picks the intermediate by matching the issuer name and then verifying the leaf's signature. If no known intermediate signed the leaf, the key is published without a chain, because a wrong chain would be worse than none.

## Verifying tokens at a resource server

1. Fetch the JWKS from the token's `iss`, whatever host it is.
2. Find the key by `kid`, and validate its `x5c` chain up to your pinned root: validity dates, key usage, and the CA flags.
3. Read the leaf's SAN URI. Accept the key if it's `urn:authhero:tenant:<tenant_id>` with the token's `tenant_id` claim, or `urn:authhero:control-plane`.
4. Verify the JWS signature with the leaf's key.

No issuer allowlist or custom-domain registry is needed. A JWKS hosted by someone else can't produce a chain to your root.

## Rolling it out

- **Existing keys are unaffected.** Keys created before the CA was configured stay self-signed and are published without `x5c`. They keep verifying as before until they're rotated out.
- **New keys are CA-issued.** This covers keys created by rotation, by revoke-and-replace, and by `ensureSigningKey` when you pass it `certificateAuthority`. It applies to control-plane keys as well as tenant keys.
- **Renewal re-issues from the CA.** `POST /api/v2/keys/signing/{kid}/renew` re-issues the certificate from the CA and keeps the `kid`.
- **Control-plane keys stay trusted.** Because they're CA-issued too, moving tenants from the shared key to their own keys with `signingKeyMode` needs no change at the resource server.

## Current limitations

- **No automatic renewal yet.** Until the scheduled renewal lands, renew CA-issued keys before they expire with the renew endpoint, or set a longer `validityDays`. An expired certificate doesn't stop AuthHero from verifying its own tokens, but a resource server that checks the chain will reject the key.
- **Seeded keys are self-signed.** The first key created by `seed()` is self-signed; rotate it once the CA is configured.
- **WFP tenant workers aren't wired up yet.** They mint their keys in `sync-defaults` without a CA. An HTTP issuer for them is planned.
