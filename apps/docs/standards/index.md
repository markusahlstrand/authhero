---
title: Standards
description: Overview of the OAuth 2.0, OpenID Connect, and SAML standards that AuthHero implements, with a status indicator for each.
---

# Standards

AuthHero is built on open identity standards. This section tracks every spec AuthHero touches and how complete our implementation is.

| Status | Meaning |
| ------ | ------- |
| **Full** | All MUST-level requirements are implemented. Optional features may still vary. |
| **Partial** | Core functionality works, but some optional features or endpoints from the spec are not yet implemented. |
| **Planned** | Declared in discovery metadata or on the roadmap, but not yet functional. |

## OAuth 2.0 family

| Standard | Status |
| -------- | ------ |
| [RFC 6749 — OAuth 2.0 Authorization Framework](/standards/rfc-6749) | Partial |
| [RFC 6750 — Bearer Token Usage](/standards/rfc-6750) | Full |
| [RFC 7636 — PKCE](/standards/rfc-7636) | Full |
| [RFC 7009 — Token Revocation](/standards/rfc-7009) | Partial |
| [RFC 7591 — Dynamic Client Registration](/standards/rfc-7591) | Partial |
| [RFC 7592 — Dynamic Client Registration Management](/standards/rfc-7592) | Full |

## Tokens & keys

| Standard | Status |
| -------- | ------ |
| [RFC 7517 — JSON Web Key (JWK)](/standards/rfc-7517) | Full |
| [RFC 7519 — JSON Web Token (JWT)](/standards/rfc-7519) | Full |
| [RFC 7638 — JWK Thumbprint](/standards/rfc-7638) | Full |

## OpenID Connect

| Standard | Status |
| -------- | ------ |
| [OpenID Connect Core 1.0](/standards/openid-connect-core) | Partial |
| [OpenID Connect Discovery 1.0](/standards/openid-connect-discovery) | Full |
| [OpenID Connect RP-Initiated Logout 1.0](/standards/oidc-rp-initiated-logout) | Partial |
| [OAuth 2.0 Form Post Response Mode](/standards/oauth2-form-post) | Full |

## Federation

| Standard | Status |
| -------- | ------ |
| [SAML 2.0](/standards/saml-2) | Partial |

## Conformance testing

AuthHero is verified against the [OpenID Foundation conformance suite](https://gitlab.com/openid/conformance-suite) via an automated Playwright-driven runner. See [Conformance Testing](/standards/conformance) for which test plans are exercised, how to run the suite locally, and how to interpret failures.

## Notes on unimplemented endpoints

A few endpoints are advertised in [`/.well-known/openid-configuration`](/standards/openid-connect-discovery) but are not yet wired up:

- **RFC 8628 — Device Authorization Grant** — `device_authorization_endpoint` is advertised but not yet routed.
- **RFC 8693 — Token Exchange** — `act`-claim based impersonation exists internally, but no `urn:ietf:params:oauth:grant-type:token-exchange` endpoint is exposed.

These will be documented as dedicated pages once implemented.
