---
"authhero": minor
"@authhero/adapter-interfaces": minor
---

Add support for the RFC 8693 token-exchange grant (`urn:ietf:params:oauth:grant-type:token-exchange`) at `/oauth/token`. Lets a confidential client exchange a self-issued access token for a new access token scoped to a different organization (and optionally downscoped). The new token records the acting client in the RFC 8693 `act` claim for audit.

The exchange enforces, in order:

- Client authentication (`client_secret` or `client_assertion`). Public clients are rejected.
- The exchanging client's `organization_usage` must not be `deny` (the default for new/DCR'd clients), so token-exchange is opt-in per client.
- The client's `grant_types` allowlist must include the token-exchange grant (existing OAuth check).
- The `subject_token` must be a JWT issued by this server (verified against the tenant JWKS), unexpired, and not already carrying an `act` claim (no re-exchange).
- The target `organization` must exist and the user must be a member — or hold the global `admin:organizations` permission on the target resource server when the tenant has `inherit_global_permissions_in_organizations` enabled (same bypass the refresh-token grant uses).
- Requested `scope` must be a subset of the subject token's scopes (downscope only).

Only `subject_token_type=urn:ietf:params:oauth:token-type:access_token` is accepted today. Foreign token types would require a per-tenant registration flow and are not in scope.

Adds `GrantType.TokenExchange` and `LogTypes.SUCCESS_EXCHANGE_SUBJECT_TOKEN_FOR_ACCESS_TOKEN` / `FAILED_EXCHANGE_SUBJECT_TOKEN_FOR_ACCESS_TOKEN` to `@authhero/adapter-interfaces`.
