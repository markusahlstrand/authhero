---
"@authhero/adapter-interfaces": patch
"authhero": patch
---

Advertise `end_session_endpoint` in `/.well-known/openid-configuration` when the tenant flag `oidc_logout.rp_logout_end_session_endpoint_discovery` is enabled (off by default, matching Auth0). Required for OIDC RP-Initiated Logout. Also adds the optional `end_session_endpoint` field to the `openIDConfigurationSchema`.
