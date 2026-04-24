---
title: SAML 2.0
description: AuthHero's implementation status for SAML 2.0.
---

# SAML 2.0

**Spec:** [OASIS SAML 2.0](https://wiki.oasis-open.org/security/FrontPage)
**Status:** Partial

SAML 2.0 support is provided by [`@authhero/saml`](/customization/saml/) and is used for both inbound federation (AuthHero acting as SP to an external IdP) and outbound SSO (AuthHero acting as IdP to downstream SAML SPs).

## Implemented

- **AuthHero as SAML IdP** — `/samlp/{client_id}` endpoint accepts `AuthnRequest` and issues signed SAML responses.
- **Metadata** — `/samlp/metadata/{client_id}` publishes IdP metadata XML.
- **HTTP-POST binding** — SAML responses are delivered via an auto-submitting HTML form POST to the SP's `AssertionConsumerServiceURL`.
- **Signed assertions** — assertions are signed with the tenant's X.509 signing key.
- **Attribute statements** — standard user attributes are mapped into SAML attributes.
- **Single Logout Service** — `SingleLogoutService` URL is published in metadata.
- **Custom signers** — tenants can supply their own signing implementation via the [SAML package](/customization/saml/custom-signers).

## Partial / not yet implemented

- **Inbound signature validation** — SAML request signature verification is incomplete; see the TODO in the SAML package source.
- **HTTP-Redirect binding** — only HTTP-POST is implemented for responses.
- **Assertion encryption** — assertions are signed but not encrypted.
- **Metadata validation** — metadata parsing is permissive and does not fully validate against the schema.

## Related AuthHero documentation

- [SAML Package](/customization/saml/)
- [SAML Configuration](/customization/saml/configuration)
- [SAML Migration from Auth0](/auth0-comparison/saml-migration)
