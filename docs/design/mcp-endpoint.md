# Design: Management API MCP endpoint

- **Status:** Phases 1 and 4 implemented (read-only tools, both host modes, audience binding). Phases 2–3 are still design.
  The user-facing reference is `apps/docs/features/mcp-server.md`.
- **Author:** Markus Ahlstrand
- **Created:** 2026-09-17
- **Related:** CIMD (`packages/authhero/src/helpers/cimd.ts`), RFC 8693 token exchange
  (`authentication-flows/token-exchange.ts`), the api-proxy MCP server this is ported from
  (`sesamy/api-proxy` `apps/api/src/mcp/`)

---

## 1. Summary

A remote [MCP](https://modelcontextprotocol.io) server that exposes the Management API as
tools, so MCP clients (Claude, ChatGPT developer mode, MCP Inspector) can read tenant
configuration, users and logs on behalf of a signed-in administrator.

It lives in `packages/authhero/src/routes/mcp/` and is mounted by `init()` when
`config.mcp` is set. It is not a separate package.

## 2. Discovery and sign-in

```
MCP client ──POST /mcp (no token)──▶ 401 WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/mcp"
           ──GET protected-resource metadata──▶ { resource, authorization_servers: [control-plane issuer] }
           ──GET <issuer>/.well-known/oauth-authorization-server──▶ client_id_metadata_document_supported: true
           ──/authorize (client_id = CIMD URL, PKCE S256, resource = MCP URL)──▶ control-plane login + third-party consent
           ──/oauth/token──▶ control-plane access token (aud = MCP URL, no org claim)
           ──POST /mcp (Bearer)──▶ tools
```

The authorization server is always the **control-plane tenant**. The people who administer a
tenant are control-plane organization members. The tenant's own login, which its end users
use, is not involved.

## 3. Host modes

The route runs the normal tenant middleware and picks a mode from the resolved tenant:

| Host                                                 | Resolved tenant         | Mode                                                                 |
| ---------------------------------------------------- | ----------------------- | -------------------------------------------------------------------- |
| Control-plane host                                   | control plane (or none) | **Multi-tenant**: `list_tenants`, and every tool takes a `tenant_id` |
| `<tenant>.<issuer apex>` or a tenant's custom domain | `<tenant>`              | **Pinned**: no `list_tenants`, no `tenant_id` argument               |

The protected-resource metadata uses the host the client called as `resource`, and always
names the control-plane issuer in `authorization_servers`.

## 4. Access model

Organization **name** equals tenant id (set by multi-tenancy provisioning). For every
tenant-scoped tool call:

1. **Membership pre-check.** Load the caller's control-plane organizations and find the
   one named after the target tenant. If there is none, the tool fails with
   `No access to tenant "<id>"`. This also yields the organization **id**, which the
   exchange needs.
2. **Token exchange (RFC 8693).** An in-process `POST /oauth/token` with
   `organization=<org id>` and `audience=urn:authhero:management`, authenticated as the
   configured exchange client. The exchange checks membership again and derives
   `permissions` from the caller's roles in that organization (the management resource
   server uses `access_token_authz`). The token carries `act` for the exchange client.
3. **Dispatch.** An in-process request to `/api/v2/...` with the exchanged token and a
   `tenant-id` header. The management API's auth, validation, entity hooks, logging and
   `tenantDispatch` (WFP forwarding) all apply unchanged.

The caller's own token is never forwarded, as the MCP spec requires. `list_tenants` reads
`listUserOrganizations` on the control plane directly and is membership-only: global
`admin:organizations` holders see only the tenants they are members of.

The management API's cross-tenant guard only checks that a token is a control-plane token;
it does not compare `org_name` with the target tenant. The MCP layer enforces membership
itself (steps 1 and 2) rather than relying on that guard.

### Bearer token checks

- The bearer token is verified against the **control-plane keyset**
  (`validateJwtToken` `tenantId` option), with `iss` compared byte-exactly to
  `mcp.controlPlaneIssuer` (default `env.ISSUER`).
- `tenant_id` must be the control-plane tenant. With shared signing keys another tenant's
  token also verifies, and on the default issuer its `iss` matches, so the claim is what
  ties the token to the control plane. Token issuance stamps `tenant_id` from the client's
  tenant so the claim is always present.
- `aud` must be exactly this host's MCP URL (the metadata `resource`). `/authorize` maps the
  RFC 8707 `resource` parameter onto `audience` (they must agree when both are sent) and
  accepts an MCP URL without a registered resource server when it is `/mcp` on a host this
  deployment serves: the issuer host, the control-plane host, an existing
  `{tenant}.{issuer host}` subdomain, or a registered custom domain.
- Tokens with an `act` claim (already exchanged) are rejected.

### Issuers

- The exchange compares the subject `iss` byte-exactly with the issuer resolved from the
  token request. On the default issuer the tenant comes from a `tenant-id` header;
  otherwise the request carries `x-forwarded-host` for the control-plane host.
- The exchanged token carries the control-plane issuer. When that is not `env.ISSUER`, the
  deployment's `additionalIssuers` must accept it for the management API. The admin UI
  already needs the same.

## 5. Protocol

Stateless Streamable HTTP in JSON mode: `initialize`, `ping`, `tools/list`, `tools/call`.
Notifications-only bodies get `202`, and `GET`/`DELETE /mcp` get `405`. It is hand-rolled,
as in api-proxy, instead of using the MCP SDK. That avoids a second zod copy and cold-start
cost. CORS is `*`, which is safe because tokens travel in a header, never cookies. The
middleware is registered per path because the app is mounted at `/`.

Tool results pass through key-based secret redaction (`secret`, `password`, `private_key`,
`credentials`, …) before they reach the model.

## 6. WFP tenant hosts (option A)

Since #1109, `<tenant>.<apex>` for a WFP tenant is dispatched straight to the tenant
worker. That worker has neither the control-plane organizations nor the exchange client
secret. The chosen approach routes MCP to the control plane instead of adding a remote
backend:

- The proxy sends `/mcp` and `/.well-known/oauth-protected-resource/mcp` on tenant hosts to
  the control plane, keeping `x-forwarded-host`.
- The control plane resolves the tenant from the forwarded host, runs the MCP logic, and
  `tenantDispatch` forwards the management call to the tenant worker as usual.

MCP code and secrets stay on the control plane only. Shared-worker tenants need no routing
change.

## 7. Phases

1. **Done:** `routes/mcp`, both host modes, read-only tools (`list_tenants`,
   `get_tenant_settings`, `list_users`, `get_user`, `list_clients`, `get_client`,
   `list_connections`, `list_resource_servers`, `list_roles`, `search_logs`), docs.
2. WFP routing (§6): a proxy route config and `cloudflare-wfp.md`.
3. Write tools behind their own permissions, with `destructiveHint` annotations.
4. **Done:** audience binding. `/authorize` maps RFC 8707 `resource` onto `audience`, and
   `/mcp` requires `aud` to be its own URL and `tenant_id` to be the control plane.

Also open: have control-plane provisioning create the exchange client, and cache exchanged
tokens across requests. Today they are cached per request only.

## 8. Out of scope

- A tenant's own users (who sign in to `<tenant>` itself) using that tenant's MCP. That
  would need an exchange without an organization and a tenant-local audience.
