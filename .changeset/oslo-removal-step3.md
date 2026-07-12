---
"authhero": patch
---

Remove the oslo dependency entirely (final step of #1099). JWT signing (signJWT) and unverified decoding (parseJWT) now live in utils/jwt.ts on Web Crypto and hono/jwt's decode; TOTP generate/verify and the otpauth:// enrollment URI are implemented in utils/totp.ts (RFC 6238, HMAC-SHA1, 6 digits, 30s period); verifyRequestOrigin moves to utils/request-origin.ts; and generateCodeVerifier joins utils/crypto.ts. Token output is byte-compatible: same header/payload construction, same exp/iat semantics, same raw ECDSA signature form.
