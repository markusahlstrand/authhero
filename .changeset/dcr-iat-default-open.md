---
"authhero": minor
"@authhero/admin": patch
---

**DCR default flipped to open registration to match Auth0.** The `dcr_require_initial_access_token` tenant flag previously defaulted to "require IAT" — turning on `enable_dynamic_client_registration` would advertise `/oidc/register` in discovery but reject every anonymous POST with 401. That contradicted Auth0's semantics, where enabling DCR means open registration.

After this change, the default is open: enabling `enable_dynamic_client_registration` makes `/oidc/register` accept anonymous RFC 7591 calls (same as Auth0). Tenants that need the stricter behavior — typically self-hosted deployments without rate-limiting in front of the endpoint — must explicitly set `flags.dcr_require_initial_access_token = true`.

The flag is now also exposed as a toggle in the admin UI's Feature Flags tab with helper text explaining the AuthHero-specific semantics.

**Migration**: tenants that today rely on the implicit IAT requirement (flag unset, with DCR enabled) will start accepting anonymous registrations after upgrading. Set `flags.dcr_require_initial_access_token = true` on those tenants before deploying if you want to preserve the old behavior.
