---
"authhero": patch
---

Replace oslo's base64url with the canonical encodeBase64Url/decodeBase64Url helpers from @authhero/adapter-interfaces (first step of the oslo removal, #1099). Encrypted field payloads are now written without base64 padding; existing padded values keep decrypting via the lenient decoder.
