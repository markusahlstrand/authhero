---
title: Email Templates
description: Customize transactional emails per tenant with Liquid templates, bundled defaults, server-side localization, and a test-send API. Compatible with Auth0's email-templates surface and extended with a few quality-of-life endpoints.
---

# Email Templates

AuthHero renders every transactional email through a layered template system: a bundled default ships with the package, a tenant can override it via the management API, and at send time the active template is rendered with Liquid using the recipient's locale, the tenant's branding, and per-send variables.

The surface is Auth0-compatible — the same template names, the same `PUT/PATCH /api/v2/email-templates/{template}`, the same fields. There are a few intentional differences, called out below.

## Lifecycle

For every send, AuthHero resolves the template in this order:

1. **Tenant override** stored in `email_templates` (Auth0-compatible). If `enabled: false`, the send is suppressed.
2. **Bundled default** compiled from React Email at build time ([`packages/authhero/src/emails/defaults/`](https://github.com/markusahlstrand/authhero/tree/main/packages/authhero/src/emails/defaults)).
3. **Caller-provided inline fallback** if neither resolves. Returns `false` from the send helper so callers can log the gap.

Rendering happens server-side via Liquid. Tenants never need to author or deploy template files — they edit them through the management API or the admin UI.

## Template Names

| Name | Sent by AuthHero | Bundled default | Notes |
|------|------------------|-----------------|-------|
| `verify_email` | ✅ | ✅ | Magic link to verify a new account |
| `verify_email_by_code` | ✅ | ✅ | One-time code to verify a new account |
| `reset_email` | ✅ | ✅ | Magic link to reset a password |
| `reset_email_by_code` | ✅ | ✅ | One-time code to reset a password |
| `welcome_email` | — | ✅ | Available; not currently dispatched by core |
| `user_invitation` | ✅ | ✅ | Organization invite email |
| `blocked_account` | — | ✅ | Available for tenant overrides; not dispatched |
| `stolen_credentials` | — | ✅ | Available for tenant overrides; not dispatched |
| `enrollment_email` | — | ✅ | MFA enrollment; available for overrides |
| `mfa_oob_code` | — | ✅ | MFA OOB code; available for overrides |
| `change_password` | — | ✅ | Legacy Auth0 name; same shape as `reset_email` |
| `password_reset` | — | ✅ | Legacy Auth0 name; password-change notification |

The names accepted by the API match Auth0's enum so an Auth0 import can populate any of them. Sending only kicks in for the entries marked sent.

## Variables Available in Templates

At render time, AuthHero injects the following Liquid context:

```liquid
{{ tenant.id }}
{{ tenant.friendly_name }}
{{ tenant.support_url }}

{{ branding.logo }}
{{ branding.primary_color }}
{{ branding.button_text_color }}
{{ branding.button_border_radius }}

{{ url }}                  <!-- e.g. magic link / reset URL -->
{{ code }}                  <!-- one-time code, when applicable -->

{% if signature.enabled %}  ...  {% endif %}
{% if footer.address %}     ...  {% endif %}
```

In addition, every translation key referenced by a default template is pre-resolved for the recipient's language and exposed as a top-level variable — for example `{{ password_reset_title }}`, `{{ code_email_subject }}`, `{{ invitation_email_intro }}`, `{{ kind_regards }}`, `{{ team_signature }}`, `{{ copyright }}`. This is the key difference from Auth0; see [Localization](#localization).

## Localization

Auth0 ships one template body per template name and **no server-side localization** — if you want multilingual emails on Auth0, you put `{% if %}` blocks inside the template that branch on `request_language` or `user.app_metadata.geo.country_code`. Adding a language touches every template; editing the design gets buried under a wall of `{% assign %}` statements.

AuthHero takes a different approach. Translation strings are loaded server-side via i18next at request time, and **pre-resolved** strings are injected into the Liquid context as variables. A template stays focused on layout:

```liquid
<h1>{{ password_reset_title }}</h1>
<p>{{ reset_password_email_click_to_reset }}</p>
<a href="{{ url }}">{{ reset_password_email_reset }}</a>
```

The same template renders in English, Swedish, German, or any other configured language without any conditional logic. Languages are added by extending the translation files, not by editing each template.

You can still use inline conditionals if you need locale-specific HTML structure, but it's not the default approach.

## Management API

### Auth0-compatible endpoints

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/v2/email-templates` | Create a new override |
| `GET` | `/api/v2/email-templates/{template}` | Read the tenant's override (404 if none) |
| `PUT` | `/api/v2/email-templates/{template}` | Upsert the override |
| `PATCH` | `/api/v2/email-templates/{template}` | Partial update |

`PUT` requires `template`, `subject`, `body`, `syntax`, `enabled` (Auth0 contract). `from` is optional — see [Differences from Auth0](#differences-from-auth0).

### AuthHero extensions

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v2/email-templates/defaults` | Returns the bundled defaults for every template (subject + body). The admin UI uses this to pre-fill the editor when no override exists. |
| `DELETE` | `/api/v2/email-templates/{template}` | Removes the tenant override; subsequent sends fall back to the bundled default. Idempotent (404 already-at-default is treated as success on the client). Requires `delete:email_templates`. |
| `POST` | `/api/v2/email-templates/{template}/try` | Renders the current subject + body with realistic sample data and dispatches a test email via the tenant's email provider. Subject is prefixed with `[TEST]`. Useful for validating customizations before saving. Requires `update:email_templates`. |

### Sending a test email

```bash
curl -X POST https://your-tenant.example.com/api/v2/email-templates/reset_email_by_code/try \
  -H "Authorization: Bearer $MANAGEMENT_TOKEN" \
  -H "tenant-id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "you@example.com",
    "subject": "{{ password_reset_title }}",
    "body": "<h1>{{ password_reset_title }}</h1><p>Code: {{ code }}</p>",
    "language": "en"
  }'
```

`subject` and `body` are optional. When omitted, the call uses the stored override and then falls back to the bundled default. `language` selects which translation bundle is used to resolve the injected variables.

## Admin UI

The admin app surfaces each template at `/{tenant}/email-templates/{template}`:

- **Pre-filled from the bundled default** — when no override exists, the editor loads the default's subject and body so editing is incremental rather than starting from a blank slate.
- **Live preview** — renders the current (unsaved) HTML with Liquid against the tenant's real `friendly_name`, `support_url`, `branding.logo_url`, and `colors.primary`. Placeholder values are used for `code` and `url`.
- **Send test** — wraps the `/try` endpoint with a dialog that defaults the recipient to the logged-in user.
- **Enable / disable** — flips the `enabled` boolean; disabled templates suppress sends entirely.
- **Delete** — removes the tenant override and reverts to the bundled default.

Clearing the subject or body field and saving is treated as "revert to default" rather than an empty save — the form re-substitutes the bundled default before sending the PUT, so the API never sees an invalid empty subject.

## Differences from Auth0

| Area | Auth0 | AuthHero |
|------|-------|----------|
| Localization | One template body; use `{% if %}` blocks inline | Server-side i18n; pre-resolved strings injected as Liquid variables |
| `from` field in PUT | Required | Optional — falls back to the email provider's `default_from_address` at send time |
| `DELETE` endpoint | Not available | Available — reverts to bundled default |
| `/defaults` endpoint | Not available | Returns bundled default subject + body for every template |
| `/try` endpoint | Not available (dashboard-only "Send test" button, no API) | Public management-API endpoint, can be called with arbitrary `body`/`subject` for unsaved previews |
| `enabled: false` | Supported (suppresses send) | Supported (same behavior) |
| Template enum | Fixed set of names | Same set of names (full Auth0 compatibility for imports) |

Behaviour is otherwise compatible: response shapes mirror Auth0's, error codes match, and a tenant migrating from Auth0 can `PUT` their existing template payloads without modification (as long as `subject` and `body` are provided).

## See Also

- [Invitations & Tickets](/features/invitations-and-tickets) — uses the `user_invitation` template
- [Authentication Flows](/features/authentication-flows) — describes which sends are triggered by which flows
- [Built-in Adapters](/customization/built-in-adapters) — Mailgun, Resend, and Postmark email providers
