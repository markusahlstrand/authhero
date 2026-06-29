---
"authhero": patch
---

Always populate a user `picture`. When a user has no picture of their own,
authhero now returns a deterministic, self-hosted SVG avatar (initials on a
palette color) served from a new public `/avatars/:initials.svg` endpoint.
The generated picture is applied everywhere a user is serialized — the
management API user and organization-member responses, `/userinfo`, and the
ID Token profile claims — so consumers can rely on `picture` being present
without rendering their own fallback. Users with an existing `picture` are
unchanged, and `picture` is still only emitted under the `profile` scope for
OIDC claims.
