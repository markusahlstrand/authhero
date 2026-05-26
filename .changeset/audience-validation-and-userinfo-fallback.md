---
"authhero": minor
---

Validate `audience` at `/authorize` and allow audience-less requests.

- `/authorize` now rejects with `access_denied` / `Service not found: <audience>` when the requested `audience` (or tenant `default_audience`) doesn't match a registered resource server. Previously the request proceeded through the full login UI and only failed at token issuance time. Auth0 parity.
- Audience is no longer required: requests without `audience` (and no tenant `default_audience`) mint a JWT with `aud = ${issuer}userinfo` instead of returning `400 invalid_request`. The token is only useful for `/userinfo`, matching Auth0's no-audience semantics (though authhero's variant is JWT-verifiable, not opaque).
- `completeLogin` now runs scope validation against the userinfo fallback audience, so requests omitting `audience` can no longer pass arbitrary non-OIDC scopes through unchecked.
