---
"authhero": patch
---

The `auth_time` claim is now emitted in the ID Token only when OIDC actually
requires it — when the authorization request used `max_age`, forced re-login
with `prompt=login`, or requested `auth_time` as an essential claim — matching
Auth0, which omits it in the optional case. Previously it was added to every
ID Token whenever a session lookup could resolve it.

This also removes a backend round-trip from the token endpoint: ordinary logins
and every refresh-token exchange (none of which carry those request parameters)
no longer perform the `sessions.get` that only existed to populate `auth_time`.
When the claim *is* required, it's resolved from the login session already in
hand where possible, falling back to `sessions.get` only if needed. OIDC
conformance for the `max_age` and `prompt=login` flows is preserved.
