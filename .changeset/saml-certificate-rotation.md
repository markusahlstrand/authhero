---
"authhero": minor
"@authhero/admin": minor
---

Manage SAML certificates from the management API and the admin console

The signing-key endpoints only ever addressed the `jwt_signing` bucket, so a
SAML certificate could only be replaced by editing the database by hand. They
now take a `type` query parameter (`jwt_signing` by default, so existing
callers are unaffected) and can operate on `saml_encryption` keys.

- `POST /api/v2/keys/signing/rotate` accepts `validity_days`, `activate_in_days`
  and `grace_days`. A key whose `current_since` is in the future is _staged_: it
  is published immediately — in JWKS, and as an extra `KeyDescriptor` in the
  SAML metadata — but does not sign until it activates. That is what makes a
  zero-downtime rotation possible for a SAML service provider, which cannot
  fetch a new certificate on its own and has to be sent one. It returns the new
  key as JSON instead of `OK`.
- `POST /api/v2/keys/signing/{kid}/renew` re-issues a certificate over the
  existing key pair. The public key, and therefore the `kid`, is unchanged, so
  anything validating against the public key it already holds keeps working.
- SAML certificates now default to a five-year lifetime; JWT signing keys stay
  at one year. Both can be overridden per request.
- SAML certificates always resolve with tenant semantics — the tenant's own key
  first, the shared control-plane key as a fallback — regardless of
  `signingKeyMode`, which exists for JWT keys where a shared key is a sane
  default. A SAML certificate is published in one tenant's IdP metadata and
  pinned by that tenant's service providers, so a shared one couldn't be rotated
  without forcing unrelated tenants' providers to re-trust at the same moment.
  Deployments whose `saml_encryption` row has no `tenant_id` are unaffected:
  with no tenant-scoped key to prefer, the fallback is the only candidate.
  Stamping a `tenant_id` on that row hands ownership — and the console's
  rotate/renew buttons — to that tenant.
- The SAML signing and metadata paths resolve keys through `resolveSigningKeys`
  instead of taking the first row of an unsorted list, so during a rotation's
  grace period the assertion is signed by the current key rather than whichever
  row the database returned first.
- Control-plane keys are inherited, not owned: a tenant sees them and verifies
  with them, but `rotate`, `renew` and `revoke` return 403. A key counts as
  inherited when it carries no private material (a public-only copy projected
  from the control plane) or when it is a shared control-plane key seen by a
  tenant that isn't the control plane, decided by the same
  `multiTenancyConfig.controlPlaneTenantId` the tenants route uses for access
  control. Deployments that set no control-plane tenant are single-tenant and
  keep managing their unscoped keys as before. Previously any tenant with
  `update:signing_keys` could revoke the shared key every other tenant was
  verifying against, or revoke a projected copy and sever verification of the
  tokens the control plane keeps issuing.
- `GET /api/v2/keys/signing` reports each certificate's `expires_at`/`expired`,
  flags the key that is actually signing, lists the inherited keys a tenant
  falls back to, and no longer returns `pkcs7`. Private key material was never
  meant to leave the server.
- New certificates fall back to a sensible subject when `ORGANIZATION_NAME` is
  unset, instead of `CN=undefined`.

In the admin console, Signing Keys splits into JWT and SAML tabs, shows each
certificate's expiry (red inside 60 days, and flagged once expired) and its
scope, and offers Rotate, Renew, and a certificate dialog with the PEM and
fingerprints to hand to a service provider. Inherited keys are labelled as such
and offer no mutating actions.
