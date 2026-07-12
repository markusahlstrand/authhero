---
"@authhero/adapter-interfaces": minor
"authhero": patch
"@authhero/saml": patch
---

Add canonical base64, base32, and hex encoding helpers to @authhero/adapter-interfaces (encodeBase64/decodeBase64, encodeBase32/decodeBase32, encodeHex) and migrate all authhero and saml call sites off oslo's encoding module (step 2 of #1099). oslo's sha256 wrapper is replaced with direct crypto.subtle.digest calls, and the oslo dependency is dropped from @authhero/saml entirely.
