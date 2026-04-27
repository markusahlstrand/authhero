---
"@authhero/adapter-interfaces": minor
"authhero": minor
---

Allow http `return_to` on `/connect/start` for loopback hosts and tenant-allowlisted dev origins.

`GET /connect/start` previously required `return_to` to be `https://<domain>` and rejected all `http://` schemes. That broke local-dev integrators (e.g. WordPress under `wp-env` at `http://127.0.0.1:8888`).

The new rule:

- HTTPS is always permitted (no behavior change).
- HTTP is permitted iff:
  1. The host is loopback — `localhost`, `127.0.0.1`, or `[::1]` (any port). Aligned with RFC 8252 §7.3.
  2. The exact origin (scheme + host + port) appears in the new tenant flag `allow_http_return_to`.
- `0.0.0.0` is always rejected; `localhost.<anything>` is not pattern-matched; trailing dots and case variations are normalized.
- `domain` and `return_to` still must agree on scheme + host + port. `domain` may now be passed as a fully-qualified origin (`http://127.0.0.1:8888`); bare host[:port] continues to mean implicit `https://`.

The consent screen at `/u2/connect/start` shows a "Local development" badge when `domain` is loopback or matches the tenant allowlist, so a user can spot a phishing attempt that claims a `localhost` callback they didn't initiate.

A new `flags.allow_http_return_to: string[]` field is added to the tenant schema. Default `[]`. Each entry must be a fully-qualified `http://` origin with no path/query/fragment; malformed entries are rejected on write.
