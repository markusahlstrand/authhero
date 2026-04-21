---
"authhero": minor
---

Resolve the tenant `default_audience` at `/authorize` time and stamp it onto the `login_session` authParams, matching Auth0's behavior ("setting the Default Audience is equivalent to appending this audience to every authorization request"). Previously the fallback was applied at token issuance and incorrectly referenced `tenant.audience` (the tenant's own identifier) instead of `tenant.default_audience`. Downstream runtime fallbacks in `createFrontChannelAuthResponse`, `silentAuth`, and `createRefreshToken` have been removed — the audience flows through on the login session.

Behavior change: tenants that were relying on the undocumented fallback to `tenant.audience` will now need `default_audience` set (or to pass `audience` explicitly) to mint access tokens without an audience. Changing the tenant `default_audience` no longer retroactively affects in-flight login sessions; it only applies to new `/authorize` requests.
