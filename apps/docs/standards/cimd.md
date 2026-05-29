---
title: Client ID Metadata Documents (CIMD)
description: AuthHero's implementation status for OAuth Client ID Metadata Documents (CIMD), used for pre-registration-free MCP client registration.
---

# Client ID Metadata Documents (CIMD)

**Spec:** [oauth.net/2/client-id-metadata-document](https://oauth.net/2/client-id-metadata-document/) · [MCP authorization spec](https://modelcontextprotocol.io/specification/draft/basic/authorization)
**Status:** Full

CIMD lets a client identify itself with an **HTTPS URL as its `client_id`** instead of registering ahead of time. The URL hosts a small JSON metadata document describing the client. The authorization server fetches and validates that document at request time, then drives the OAuth flow from it — no [Dynamic Client Registration](/standards/rfc-7591) call and no stored client record required.

CIMD is the preferred client-registration mechanism in the Model Context Protocol (SEP-991, 2025-11-25 spec), and AuthHero's behavior mirrors Auth0's CIMD support.

## Enabling CIMD

CIMD is **off by default** and enabled per tenant via the `client_id_metadata_document_registration` flag (the same flag name Auth0 uses). When enabled:

- [`/.well-known/oauth-authorization-server`](/standards/rfc-8414) and [`/.well-known/openid-configuration`](/standards/openid-connect-discovery) advertise `client_id_metadata_document_supported: true`.
- `/authorize` and `/oauth/token` accept an HTTPS URL as `client_id`.

## How it works

When the `client_id` is an HTTPS URL on a CIMD-enabled tenant, AuthHero:

1. Validates the URL shape, then fetches the document over an SSRF-protected HTTPS request (no redirects, size-capped).
2. Validates the document and confirms its `client_id` field exactly matches the URL it was fetched from — this binds the client identity to control of the URL.
3. Synthesizes an **ephemeral** client (it is never written to the database) and uses it for the rest of the flow. The document is the source of truth and is re-fetched on each request.

## Validation rules

**URL (`client_id`):**

- Must be HTTPS, with a path beyond `/`, at most 120 bytes.
- No userinfo/credentials, query string, fragment, or port `0`.
- Loopback and private hosts are rejected by the SSRF guard.

**Document fields:**

| Field | Requirement |
| ----- | ----------- |
| `client_id` | Must exactly match the URL the document was fetched from. |
| `client_name` | Required, non-empty. |
| `grant_types` | Must include at least one of `authorization_code` or `refresh_token`; other grants are filtered out. |
| `redirect_uris` | Required for the authorization code flow; must be HTTPS URIs. |
| `application_type` | Optional — `native` or `web`. |
| `token_endpoint_auth_method` | Optional — `none` (public) or `private_key_jwt`. |
| `jwks_uri` | Required when `token_endpoint_auth_method` is `private_key_jwt`; inline `jwks` is not accepted. |

## Security characteristics

- CIMD clients are treated as **public, third-party** clients (no `client_secret`).
- **PKCE with `S256` is required** for any authorization code flow.
- For `private_key_jwt` clients, signing keys are loaded from the document's `jwks_uri` over the same SSRF-protected fetch path.

## Related AuthHero documentation

- [RFC 8414 — Authorization Server Metadata](/standards/rfc-8414)
- [RFC 7591 — Dynamic Client Registration](/standards/rfc-7591) (the pre-registration alternative)
- [RFC 7636 — PKCE](/standards/rfc-7636)
- [RFC 9728 — Protected Resource Metadata](/standards/rfc-9728)
