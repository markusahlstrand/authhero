---
"authhero": patch
---

Accept `"us"` as an explicit Mailgun region in addition to `"eu"` and null. Previously the schema rejected `region: "us"` with a Zod validation error even though it's a value some clients send.
