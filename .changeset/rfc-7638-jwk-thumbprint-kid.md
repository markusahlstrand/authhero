---
"authhero": minor
---

Derive signing-key `kid` from the RFC 7638 JWK Thumbprint.

`createX509Certificate` now sets the `kid` (and the existing `fingerprint` field) to the SHA-256 base64url thumbprint of the public JWK, computed per RFC 7638 (only the required members for the kty, in lexicographic order, no whitespace). This produces a deterministic, self-verifying key identifier that any client can recompute from the published JWKS.

Existing keys keep their original `kid` (a hex-encoded certificate serial number) — `kid` is stored on each row, so previously issued tokens continue to verify. Only newly created keys use the thumbprint format. Operators can normalise via `POST /api/v2/keys/signing/rotate`.

A new exported `computeJWKThumbprint(jwk)` helper is available for any caller that needs to compute the thumbprint of an arbitrary JWK.
