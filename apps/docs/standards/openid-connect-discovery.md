---
title: OpenID Connect Discovery 1.0
description: AuthHero's implementation status for OpenID Connect Discovery 1.0.
---

# OpenID Connect Discovery 1.0

**Spec:** [openid.net/specs/openid-connect-discovery-1_0.html](https://openid.net/specs/openid-connect-discovery-1_0.html)
**Status:** Full

OpenID Connect Discovery lets clients dynamically learn an OP's endpoints and capabilities via a well-known URL.

## Implemented

- **Discovery endpoint** — `GET /.well-known/openid-configuration`. The same document is also served at [`/.well-known/oauth-authorization-server`](/standards/rfc-8414) (RFC 8414).
- **JWKS endpoint advertisement** — `jwks_uri` points to [`/.well-known/jwks.json`](/standards/rfc-7517).
- **Core endpoints** — `issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`, `revocation_endpoint`, `device_authorization_endpoint`, `mfa_challenge_endpoint` are always advertised.
- **Conditional endpoints** — `registration_endpoint` is included only when Dynamic Client Registration is enabled for the tenant; `end_session_endpoint` is included by default and can be hidden by setting `oidc_logout.rp_logout_end_session_endpoint_discovery` to `false` (see [OIDC RP-Initiated Logout](/standards/oidc-rp-initiated-logout)).
- **Supported response types** — `code`, `token`, `id_token`, `code token`, `code id_token`, `token id_token`, `code token id_token`.
- **Supported response modes** — `query`, `fragment`, `form_post`.
- **Supported grant types** — `authorization_code`, `client_credentials`, `refresh_token`, `implicit`, plus Auth0-compatible passwordless OTP grant.
- **Supported scopes** — `openid`, `profile`, `email`, `address`, `phone`, `offline_access`, plus profile claim scopes.
- **Supported subject types** — `public`.
- **ID token signing algorithms** — `RS256` (default), `ES256`, `ES384`, `ES512`. The algorithm is derived from the tenant's `jwt_signing` key material.
- **Token endpoint auth methods** — `client_secret_basic`, `client_secret_post`, `client_secret_jwt`, `private_key_jwt`. See [RFC 7523](/standards/rfc-7523).
- **Request objects** — `request_parameter_supported: true`, `request_uri_parameter_supported: true`, with `request_object_signing_alg_values_supported` listing `RS256/384/512`, `ES256/384/512`, `HS256/384/512`. See [RFC 9101](/standards/rfc-9101).
- **PKCE** — `code_challenge_methods_supported`: `S256`, `plain`.
- **Supported claims** — published in `claims_supported`.

## Declared but not yet implemented

Some endpoints are advertised for compatibility but the underlying functionality is on the roadmap:

- `revocation_endpoint` — RFC 7009 token revocation.
- `device_authorization_endpoint` — RFC 8628 device flow.

See the [Standards overview](/standards/) for details.

## Related AuthHero documentation

- [OpenID Connect Core](/standards/openid-connect-core)
- [API Endpoints](/api/endpoints)
