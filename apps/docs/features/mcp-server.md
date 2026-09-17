---
title: Management API MCP Server
description: Connect MCP clients such as Claude to the AuthHero Management API, with sign-in through the control plane and access based on organization membership.
---

# Management API MCP Server

AuthHero can expose the Management API as a remote [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. An MCP client such as Claude, ChatGPT developer mode or MCP Inspector can then read tenant settings, users, applications, connections and logs for the administrator who signs in.

The server is read-only.

## How it works

- **Sign-in goes through the control plane.** MCP clients register with [CIMD](/standards/cimd): their `client_id` is an HTTPS URL, so no client needs to be created up front. The administrator signs in to the control-plane tenant and approves the client on the consent screen.
- **Organization membership decides access.** A user can reach a tenant when they are a member of the control-plane organization named after that tenant. On each call, their token is exchanged ([RFC 8693](/standards/rfc-8693)) for a management token scoped to that organization. Its permissions come from the user's roles in the organization.
- **Tokens are bound to one MCP URL.** Clients send the MCP URL as the RFC 8707 `resource` parameter, and AuthHero uses it as the token audience. `/mcp` only accepts a control-plane token whose `aud` is its own URL, so tokens issued to other clients or APIs are rejected.
- **Calls go through the normal Management API**, so the same permission checks, validation, hooks and logs apply.
- **Secrets are redacted** from tool results before they reach the model.

## Endpoints

The endpoint depends on the host the client connects to:

| URL                                                              | What you get                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `https://<control-plane host>/mcp`                               | Every tenant you are a member of. Call `list_tenants`, then pass `tenant_id` to the other tools. |
| `https://<tenant>.<your domain>/mcp` or a tenant's custom domain | That tenant only. Tools take no `tenant_id`.                                                     |

Each host also serves [RFC 9728](/standards/rfc-9728) metadata at `/.well-known/oauth-protected-resource/mcp`. Clients read it to find the authorization server.

## Tools

| Tool                         | Management API                 | Permission              |
| ---------------------------- | ------------------------------ | ----------------------- |
| `list_tenants`               | Control-plane organizations    | Membership              |
| `get_tenant_settings`        | `GET /api/v2/tenants/settings` | `read:tenants`          |
| `list_users`, `get_user`     | `GET /api/v2/users`            | `read:users`            |
| `list_clients`, `get_client` | `GET /api/v2/clients`          | `read:clients`          |
| `list_connections`           | `GET /api/v2/connections`      | `read:connections`      |
| `list_resource_servers`      | `GET /api/v2/resource-servers` | `read:resource_servers` |
| `list_roles`                 | `GET /api/v2/roles`            | `read:roles`            |
| `search_logs`                | `GET /api/v2/logs`             | `read:logs`             |

A missing permission comes back as a tool error, for example `403: Unauthorized`.

## Setup

The MCP server needs a multi-tenant deployment with a control plane (see [Multi-Tenant SaaS](/features/multi-tenant-saas)).

1. **Enable CIMD on the control-plane tenant.** Set the `client_id_metadata_document_registration` flag.
2. **Create an exchange client on the control-plane tenant.** It needs:
   - a client secret
   - `organization_usage` set to `allow`
   - the `urn:ietf:params:oauth:grant-type:token-exchange` grant type
3. **Pass the config to `init`** (or `initMultiTenant`):

```ts
const { app } = init({
  dataAdapter,
  mcp: {
    exchangeClientId: "mcp-exchange",
    // Only needed when the control plane is not served on env.ISSUER,
    // e.g. on its own subdomain. Must match the token `iss` exactly.
    controlPlaneIssuer: "https://control.auth.example.com/",
  },
});
```

When `controlPlaneIssuer` differs from `env.ISSUER`, add it to `additionalIssuers` so the Management API accepts the exchanged tokens. The admin UI already needs this.

## Connecting a client

```bash
claude mcp add --transport http authhero https://control.auth.example.com/mcp
```

The first tool call opens the control-plane login in the browser. For a single tenant, use that tenant's host instead, for example `https://acme.auth.example.com/mcp`.

## Limitations

- A token is bound to the host it was issued for, so a client that connects to both the control-plane host and a tenant host signs in once for each.
- On Workers for Platforms, `/mcp` on tenant hosts must be routed to the control plane.
- Users who sign in to a tenant directly, rather than through the control plane, cannot use that tenant's MCP endpoint.
