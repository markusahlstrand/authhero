---
"@authhero/widget": patch
"authhero": patch
---

Fix the "Try Connection" result screen rendering as "No screen configuration provided" after an OIDC/SAML connection test completes. The universal-login SSR was embedding the screen config as a JSON-stringified HTML attribute (`screen='…'`); HTML attribute parsing decodes character references, which broke any payload whose inner content had been HTML-escaped for an innerHTML context (`&quot;` → `"` mid-JSON). The try-connection-result screen was the first to embed an HTML-escaped JSON dump (the upstream userinfo), so it tripped the bug.

The widget's SSR transport now ships screen/branding/theme/auth-params as `<script type="application/json">` children of the widget — script content is opaque to HTML entity decoding, so the JSON round-trips verbatim. The widget falls back through prop → script tag → legacy attribute.

Also hide the per-tenant `authhero-try-connection-<tenantId>` stub client (created by `POST /api/v2/connections/:id/try`) from the management API's clients list, and reject `PATCH`/`DELETE` against it. Admins shouldn't see or be able to break the platform-managed row.
