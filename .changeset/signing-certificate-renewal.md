---
"authhero": minor
---

Add `renewSigningCertificates()` for scheduled handlers. It re-issues CA-issued signing certificates that are close to expiry and keeps the `kid`. Also add `createHttpCertificateIssuer` and `createCertificateIssuerApp`, so the signing CA can run as a separate service. The service requires an `authorize` check and caps certificate lifetimes with `maxValidityDays`.
