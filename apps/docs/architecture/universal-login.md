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

## Customization

For details on customizing the login experience, see [UI Widget](/customization/ui-widget/) in the Customization section.
