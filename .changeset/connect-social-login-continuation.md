---
"authhero": patch
---

Fix social login during the Connect consent flow when the login session is anchored to a Client ID Metadata Document client. Resume live, matching Connect sessions without requiring OAuth response parameters or PKCE, while retaining PKCE enforcement for ordinary authorization-code requests.
