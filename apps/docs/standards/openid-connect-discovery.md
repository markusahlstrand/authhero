---
title: OpenID Connect Discovery 1.0
description: AuthHero's implementation status for OpenID Connect Discovery 1.0.
---

# OpenID Connect Discovery 1.0

**Spec:** [openid.net/specs/openid-connect-discovery-1_0.html](https://openid.net/specs/openid-connect-discovery-1_0.html)
**Status:** Full

OpenID Connect Discovery lets clients dynamically learn an OP's endpoints and capabilities via a well-known URL.

## Implemented

- **Discovery endpoint** — `GET /.well-known/openid-configuration`.
- **JWKS endpoint advertisement** — `jwks_uri` points to [`/.well-known/jwks.json`](/standards/rfc-7517).
- **Core endpoints** — `issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `registration_endpoint`, `end_session_endpoint`.
- **Supported response types** — `code`, `token`, `id_token`, `code token`, `code id_token`, `token id_token`, `code token id_token`.
- **Supported response modes** — `query`, `fragment`, `form_post`.
- **Supported grant types** — `authorization_code`, `client_credentials`, `refresh_token`, plus Auth0-compatible passwordless OTP grant.
- **Supported scopes** — `openid`, `profile`, `email`, `address`, `phone`, `offline_access`.
- **Supported subject types** — `public`.
- **Supported signing algorithms** — `RS256` (ID tokens), plus additional algorithms for access tokens.
- **Supported token endpoint auth methods** — `client_secret_basic`, `client_secret_post`, `none`.
- **Supported claims** — published in `claims_supported`.

## Declared but not yet implemented

Some endpoints are advertised for compatibility but the underlying functionality is on the roadmap:

- `revocation_endpoint` — RFC 7009 token revocation.
- `device_authorization_endpoint` — RFC 8628 device flow.

See the [Standards overview](/standards/) for details.

## Related AuthHero documentation

- [OpenID Connect Core](/standards/openid-connect-core)
- [API Endpoints](/api/endpoints)
