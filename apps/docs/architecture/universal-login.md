---
title: Universal Login
description: AuthHero's universal login system — the u2 widget-based UI and the legacy server-rendered login.
---

# Universal Login

Universal Login is the authentication UI that users interact with when logging in. AuthHero redirects users here from the `/authorize` endpoint.

## /u2/ — Widget-Based Login (Recommended)

The current login experience uses the `@authhero/widget`, a StencilJS web component that renders server-driven UI:

- **Server-Driven UI (SDUI)** — The server controls what screens and fields are displayed
- **Zero-deploy updates** — Change auth flows via the Management API without redeploying
- **Framework-agnostic** — Works with React, Vue, Angular, or vanilla JS
- **Customizable** — Theme via CSS custom properties
- **Auth0 Forms compatible** — Uses the same Forms API schema as Auth0

The widget fetches screen configurations from the Auth API and renders the appropriate UI (identifier, password, code entry, signup, password reset, MFA, etc.).

## /u/ — Server-Rendered Login (Deprecated)

The original login UI renders full HTML pages on the server using JSX:

- Server-rendered with direct form submissions
- Includes pre-built screens for all auth flows

::: warning
The server-rendered `/u/` login is being deprecated in favor of the widget-based `/u2/` login. New features are only being added to `/u2/`.
:::

## /u/flow-widget/ — Flow-Based Widget

A hybrid approach for advanced use cases:

- Flows are configured via the Management API using the Forms/Flows API
- Supports progressive profiling, custom consent, and multi-step forms
- Uses the widget for rendering but the server drives the flow logic

## "Last Used" Connection Badge

The u2 identifier and combined login screens can highlight the connection the user last logged in with — a "Last used" pill on the matching social (or passwordless) button. It is **opt-in** via the `show_last_used_connection` prompt setting (default `false`):

```http
PATCH /api/v2/prompts
{
  "show_last_used_connection": true
}
```

How it works:

- On a **successful** login (never on failure), AuthHero sets a per-tenant `{tenant_id}-last-used-connection` cookie holding only the connection name — no user id or other PII. It is `httpOnly`, `SameSite=Lax`, and lives for one year.
- On the next visit, the matching button in `provider_details` gets `last_used: true` plus a server-translated `last_used_label` ("Last used", localized in all eight locales; overridable per tenant via prompt custom text as `lastUsedText`).
- A stale cookie naming a connection that no longer exists on the client shows nothing.

The badge only appears on the widget-based `/u2/` screens; the deprecated server-rendered `/u/` login does not render it. Style it from outside the widget via the `button-social-badge` CSS part, or recolor it with the `--ah-color-last-used` / `--ah-color-last-used-text` custom properties — see [Widget Customization](/customization/ui-widget/customization).

## Customization

For details on customizing the login experience, see [UI Widget](/customization/ui-widget/) in the Customization section.

To customize the page chrome around the widget — logo, dark-mode toggle, language picker, legal links, and content above/below the card — see [Page Templates (Liquid)](/customization/ui-widget/liquid-templates).
