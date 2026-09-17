---
"authhero": minor
---

Add a Management API MCP server. When `mcp` is configured, `init()` serves `POST /mcp` plus RFC 9728 protected-resource metadata. MCP clients sign in to the control-plane tenant (via CIMD). On the control-plane host the read-only tools take a `tenant_id`; on a tenant's own host they are pinned to that tenant. Access follows control-plane organization membership: each call exchanges the caller's token for an organization-scoped management token and dispatches to `/api/v2` in-process. Tokens are bound to the MCP URL: `/authorize` now accepts the RFC 8707 `resource` parameter as the audience, and `/mcp` requires `aud` to be its own URL and `tenant_id` to be the control plane. Access tokens now always take `tenant_id` from the client's tenant. `validateJwtToken` gains a `tenantId` option to verify against a specific tenant's keyset.
