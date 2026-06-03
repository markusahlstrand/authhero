---
"authhero": patch
---

Restructure the bundled email layout to match Auth0's structure: larger centered logo, signature block ("Kind Regards, / The {Tenant} Team") defaulted on, italic muted disclaimer with inline contact-us link, and an optional outside-card address slot.

All visual tokens are emitted as Liquid placeholders so tenants can re-skin without editing the template body: `{{ branding.button_text_color }}` and `{{ branding.button_border_radius }}` are now picked up by `PrimaryButton` (default values are supplied at render time by `sendTemplatedEmail`, since React Email's HTML escaping prevents inline `| default:` filters from parsing), `{{ signature.enabled }}` toggles the signature block, and `{{ footer.address }}` renders the address block when set.

Link-mode templates (verify, reset, welcome, user invitation) now include a "If you prefer, copy this link" fallback paragraph with the plain URL — matching Auth0 link emails. Code-mode templates mirror the same frame.

Adds three new i18n keys across all 8 locales: `kind_regards`, `team_signature` ("The {{vendorName}} Team"), and `link_email_fallback_intro`. `SendTemplatedEmailParams` now accepts an optional `language` so the central renderer resolves these strings once.

No breaking changes — existing tenant template overrides stored via the management API continue to render unchanged.
