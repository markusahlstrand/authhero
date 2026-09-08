---
"authhero": patch
---

Trim module-evaluation cost on cold start: construct the LiquidJS engines (email templates, custom universal-login templates) lazily on first use, import `@authhero/saml` only through its `core` entry so the SAML core is no longer bundled twice, and dedupe `@peculiar/x509`. Bundle shrinks by ~230 KB and bare import time drops ~14%. No public API changes.
