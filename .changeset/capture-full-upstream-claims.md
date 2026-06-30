---
"authhero": minor
---

Persist the full upstream claim set to `profileData` for enterprise connections (issue #1003).

The connection callback now prefers each strategy's `validateAuthorizationCodeAndGetUserWithRaw` variant and stores the entire decoded upstream claim set (id_token / userinfo claims — no tokens or secrets) in `profileData`, instead of only the five normalized fields. This makes claims like `upn`, `preferred_username`, `unique_name`, and `oid` durably available (Auth0 `identities[].profileData` parity) — e.g. for diagnosing Entra/`waad` cases where the `email` claim (from `mail`) differs from the sign-in identifier.

- Added a `WithRaw` variant to the `waad` / Microsoft Entra strategy.
- Strategies that don't implement `WithRaw` (most social ones) are unchanged: they fall back to the normalized userinfo with `raw: null`.

Also double-writes the login counters (`last_login`, `last_ip`, `login_count`) to the new `user_activity` adapter when present, alongside the existing `users` columns (expand phase of issue #1003). No-op when the adapter isn't configured.
