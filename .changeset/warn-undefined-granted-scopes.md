---
"authhero": patch
---

Warn when a client grant or a user permission references a scope the resource server does not define. These scopes were dropped from the issued token with no error, warning or log, so a grant listing five scopes could mint a token carrying three with nothing explaining the difference. The warning carries the tenant, client, audience and dropped scope list. Issued scopes are unchanged — this is observability only.
