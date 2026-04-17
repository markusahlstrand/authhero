---
"authhero": patch
---

Resolve `linked_to` in the refresh-token and authorization-code grants so tokens minted from a secondary (linked) user's credentials carry the primary user's `sub`. Previously only the password grant did this, leaving refresh tokens and session-resume flows issuing tokens in the secondary's name post-link.
