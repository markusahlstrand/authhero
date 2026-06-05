---
title: Email Templates Comparison
description: AuthHero's email template system is Auth0-compatible at the API level but introduces server-side localization, a /try endpoint, and a DELETE endpoint so customizations are easier to author and revert.
---

# Email Templates: AuthHero vs. Auth0

The full feature reference lives at [Features → Email Templates](/features/email-templates). This page focuses on what's different from Auth0 and why.

## Side-by-side

| Area | Auth0 | AuthHero |
|------|-------|----------|
| Template names | Fixed enum of 12 | Same 12 — full import compatibility |
| Storage | Override required to send anything other than Auth0's own defaults | Bundled defaults ship with the package; tenant override is opt-in |
| `subject` required on `PUT` | Yes | Yes (matches Auth0) |
| `from` required on `PUT` | Yes | **No** — falls back to the email provider's `default_from_address` at send time |
| Localization | Inline `{% if %}` blocks on `request_language` or `user.app_metadata.geo.country_code` | Server-side i18next; pre-resolved strings injected as Liquid variables |
| `DELETE /api/v2/email-templates/{template}` | Not available | **Available** — removes override, reverts to bundled default |
| `GET /api/v2/email-templates/defaults` | Not available | **Available** — returns bundled defaults for every template |
| `POST /api/v2/email-templates/{template}/try` | Not available (dashboard-only button) | **Available** — public endpoint, accepts an in-progress `body`/`subject` for testing unsaved edits |
| `enabled: false` | Supported | Supported (same semantic — suppresses sending) |
| Response shapes | Auth0 SDK-compatible | Same |

## Why server-side localization

Auth0's `request_language` pattern means tenants end up with templates that look like this:

```liquid
{% assign user_country = user.app_metadata.geo.country_code %}
{% if user_country == 'SE' %}
  {% assign label_headline = 'Ändra ditt lösenord' %}
  {% assign label_p1 = 'Du har bett om en länk för att uppdatera ditt lösenord.' %}
{% else %}
  {% assign label_headline = 'Password Change Request' %}
  {% assign label_p1 = 'You have submitted a password change request.' %}
{% endif %}

<h1>{{ label_headline }}</h1>
<p>{{ label_p1 }}</p>
```

For 20 languages with 6 strings each, that's a 120-line preamble before the actual HTML. Editing the design becomes painful; adding a language touches every template.

AuthHero loads i18next at request time and injects pre-resolved strings into Liquid:

```liquid
<h1>{{ password_reset_title }}</h1>
<p>{{ reset_password_email_click_to_reset }}</p>
```

The same template renders in any configured language. Adding a language adds entries to the translation files; existing templates pick them up automatically. You can still use inline conditionals when you need locale-specific HTML structure — but you don't have to use them for translation.

Note: Auth0's `user.app_metadata.geo.country_code` is also indirect — geo doesn't equal language preference (a German tourist in Sweden would get Swedish copy). AuthHero resolves language from the request's `Accept-Language` chain just like the rest of the universal-login surface.

## Why `from` is optional

Email providers in AuthHero ([Built-in Adapters](/customization/built-in-adapters)) carry a `default_from_address`. The render path applies that address whenever the template's `from` is blank:

```ts
from: result.email.from || emailProvider.default_from_address || `login@${ISSUER}`;
```

So the typical case — "send from whatever's configured on the provider" — needs no template-level `from`. Auth0 requires the field; AuthHero accepts it being absent. The admin UI exposes a placeholder explaining the fallback.

## Why a `DELETE` endpoint

Auth0's only way to "remove" a customization is `PATCH { enabled: false }`, which **disables** the email entirely. There's no way to say "use Auth0's default again" once you've created an override.

AuthHero keeps the `enabled` toggle (same semantic), and adds `DELETE` as a clean "reset to default" affordance: it removes the override, leaves the email enabled, and future sends use the bundled default. Useful for tenants who experimented with customizing a template and want to roll back.

## Why a `/try` endpoint

Auth0's dashboard has a "Send test" button, but it's not exposed as an API — automation and CI can't validate templates without sending real auth events. AuthHero's `/try` is a public management endpoint that:

- Accepts arbitrary `body`/`subject` in the POST so the admin UI can test **unsaved** edits.
- Renders with the same Liquid context the real send path uses (real tenant + branding + i18n strings; placeholder `code` and `url`).
- Dispatches through the tenant's configured email provider, with the subject prefixed `[TEST]` so recipients can distinguish.

## Migration

A tenant importing email templates from Auth0 can `PUT` their existing payloads directly. The only thing that changes is opportunity: once on AuthHero, the inline `{% if user_country == 'SE' %}` blocks can be replaced with single Liquid variables sourced from server-side translations. That's optional — Auth0-style inline conditionals still work because they're plain Liquid.
