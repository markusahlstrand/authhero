---
title: OAuth 2.0 Form Post Response Mode
description: AuthHero's implementation status for the OAuth 2.0 Form Post Response Mode specification.
---

# OAuth 2.0 Form Post Response Mode

**Spec:** [openid.net/specs/oauth-v2-form-post-response-mode-1_0.html](https://openid.net/specs/oauth-v2-form-post-response-mode-1_0.html)
**Status:** Full

Form Post Response Mode lets the authorization server deliver authorization response parameters via an auto-submitting HTML form instead of a redirect URL, which keeps tokens out of browser history and referrer headers.

## Implemented

- **`response_mode=form_post`** — accepted on the `/authorize` endpoint.
- **Auto-submitting HTML form** — response parameters (e.g. `code`, `state`, `id_token`) are rendered as hidden inputs in a form that posts to `redirect_uri` on load.
- **Compatibility with all response types** — works with `code`, `id_token`, and hybrid response types.
- **Advertised in discovery** — `form_post` appears in `response_modes_supported` in `/.well-known/openid-configuration`.

## Related AuthHero documentation

- [OpenID Connect Core](/standards/openid-connect-core)
- [Login Flow endpoints](/architecture/login-flow)
