---
"authhero": patch
---

Temporarily exempt `/api/v2/users*` and `/api/v2/users-by-email*` from the management API audience check (added in the previous "validate audience" change). External callers using the legacy audience were hitting 403s on these endpoints. Scope and JWT signature/expiry checks still run as before — only the `aud === urn:authhero:management` equality check is skipped for these prefixes. To be removed once those callers migrate to the new audience.
