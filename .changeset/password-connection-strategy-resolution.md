---
"authhero": patch
---

Resolve the password realm against connections with the canonical "auth0" strategy (and other legacy spellings), not just the literal "Username-Password-Authentication" strategy. Tenants whose database connection uses a custom name with strategy "auth0" logged password logins with the generic connection literal and an empty connection_id.
