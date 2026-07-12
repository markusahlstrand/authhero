---
"authhero": minor
"@authhero/adapter-interfaces": minor
"create-authhero": patch
---

Implement OIDC Back-Channel Logout 1.0. When a session ends — via /v2/logout, /oidc/logout, or Management API session revoke/delete — the OP now POSTs a signed logout token (typ `logout+jwt`, with `sid`, `sub`, and the backchannel-logout `events` claim, never a `nonce`) to each participating client's registered `oidc_logout.backchannel_logout_urls`. Delivery is best-effort in the background and goes through the SSRF-safe URL check. Discovery now advertises `backchannel_logout_supported` and `backchannel_logout_session_supported`. The client `oidc_logout` field is now typed (`backchannel_logout_urls`, `backchannel_logout_initiators`), and the create-authhero conformance seed passes `oidc_logout` through for extra clients.
