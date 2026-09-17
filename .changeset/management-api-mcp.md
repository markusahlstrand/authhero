---
"authhero": minor
---

Add a Management API MCP server. When `mcp` is configured, `init()` serves `POST /mcp` plus RFC 9728 protected-resource metadata. MCP clients sign in to the control-plane tenant (via CIMD). On the control-plane host the read-only tools take a `tenant_id`; on a tenant's own host they are pinned to that tenant. Access follows control-plane organization membership: each call exchanges the caller's token for an organization-scoped management token and dispatches to `/api/v2` in-process. `validateJwtToken` gains a `tenantId` option to verify against a specific tenant's keyset.
