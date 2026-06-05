---
"authhero": minor
"@authhero/admin": minor
---

Add `POST /api/v2/email-templates/{templateName}/try` endpoint and a "Send test" button in the admin UI. Renders the current (saved or in-progress) subject and body with sample data and dispatches via the tenant's email provider so customizations can be verified before saving.

Pre-fill the admin email-template edit form with the bundled default subject and body when no tenant override exists, so users can see and edit the starting point directly instead of an empty form. The subject input also shows the bundled default as a placeholder when the field is cleared.

Clearing the subject or body in the admin form now reverts to the bundled default on save instead of returning a 400. The PUT body's `from` field is now optional — at send time it falls back to the email provider's `default_from_address`. (Auth0 requires `from`; this is an authhero extension.)

The admin preview now uses the current tenant's `friendly_name`/`support_url` and `branding.logo_url`/`colors.primary` so the rendered HTML matches what real recipients will see. The bundled default HTML is also emitted pretty-printed at build time so the editor pre-fill is human-readable instead of a single minified line.

Add `DELETE /api/v2/email-templates/{templateName}` to remove a tenant's override and revert subsequent sends to the bundled default. (Auth0 has no DELETE; their pattern is `PATCH { enabled: false }` to disable. authhero keeps that toggle and adds DELETE as a clean "reset to default" affordance.) Authorized by `update:email_templates` — semantically a revert, not a destructive delete, so it piggybacks on the existing update scope rather than introducing a `delete:email_templates` scope that Auth0 doesn't define. Wired up to the admin's standard Delete button — clicking Delete on an override now reverts to the default instead of 404'ing.

Add bundled defaults for the remaining six email template names so every template in the admin UI has a non-empty starting point: `blocked_account`, `stolen_credentials`, `enrollment_email`, `mfa_oob_code`, `change_password` (legacy), `password_reset` (legacy). authhero itself does not send these — they exist for Auth0-import compatibility and so tenants can pre-configure overrides.

Documentation: new pages at `features/email-templates` and `auth0-comparison/email-templates` describing the lifecycle, available variables, server-side localization, the management API surface, and the deltas vs Auth0.
