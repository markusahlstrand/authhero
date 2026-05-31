---
"authhero": patch
---

Advertise `none` in `token_endpoint_auth_methods_supported` on `/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server`. The token endpoint already accepts public clients registered with `token_endpoint_auth_method = "none"` (e.g. PKCE-only flows, CIMD clients), but the discovery document did not list it — so RFC 8414-conformant clients (including MCP clients using CIMD) would assume the AS rejected unauthenticated token calls and refuse to send them.
