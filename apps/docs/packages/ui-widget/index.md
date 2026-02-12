---
title: UI Widget
description: Server-driven UI web component for authentication flows built with StencilJS. Framework agnostic, customizable, and SSR compatible.
---

# UI Widget

The `@authhero/widget` is a server-driven UI web component for authentication flows, built on [StencilJS](https://stenciljs.com/).

## Overview

The widget is a **pure UI component** that can be embedded in either:

- **Hosted Login Pages** - Server-rendered pages controlled by AuthHero
- **Client Applications** - Directly in your SPA or website

It uses a **server-driven UI (SDUI)** architecture where all authentication logic lives on the server. The widget simply renders what the server tells it to render and emits events for user interactions.

## Key Features

- 🎯 **Framework Agnostic** - Works with React, Vue, Angular, or vanilla JS
- 🔄 **Server-Driven** - All logic lives on the server, no client-side auth code
- 📦 **Web Component** - Built with StencilJS for maximum compatibility
- 🎨 **Customizable** - Full branding support (colors, logo, fonts)
- ⚡ **SSR Support** - Can be server-side rendered and hydrated
- 🔌 **Event-Based** - Pure UI that emits events for auth library integration
- 🌍 **Universal** - Same widget works for all integration patterns

## How It Works

The widget tracks two key pieces of state:

1. **`state`** (required) - The login session identifier, always passed as a query string parameter
2. **`formId`** (required) - The form to render (e.g., `login`, `signup`, `mfa`)

The `formId` can be provided in two ways:

- **Path-based**: `/u/flow/login/screen?state=abc123`
- **Query-based**: `/u/flow/screen?form=login&state=abc123`

This dual-mode support allows the widget to work in both:

- **Hosted pages** where the form is known at page render time (path-based)
- **SPAs** where the form and screen are controlled dynamically (query-based)

## Documentation

- [Getting Started](./getting-started) - Installation and basic usage
- [Client-Server Protocol](./client-server-protocol) - How the widget communicates with the server
- [SSR & Hydration](./ssr-hydration) - Server-side rendering guide
- [Props & Events](./props-events) - Widget properties and events reference
- [Integration Patterns](./integration-patterns) - Different ways to integrate the widget
- [Customization](./customization) - Branding, theming, and CSS styling
- [API Reference](./api-reference) - Screen configuration and components

## Client-Server Communication

The widget implements a custom **Server-Driven UI (SDUI)** protocol for authentication flows. This is not a StencilJS built-in feature—it's a custom implementation built on top of the web component framework.

When `auto-submit="true"` and `auto-navigate="true"` are set, the widget:

1. POSTs form data as JSON to the screen's action URL
2. Processes the server response (next screen or redirect)
3. Updates the browser URL via `history.pushState()` for seamless navigation

See the [Client-Server Protocol](./client-server-protocol) documentation for full details on the request/response format and implementation.

### Quick Example

**Request:**

```http
POST /u2/screen/identifier?state=abc123
Content-Type: application/json

{ "data": { "username": "user@example.com" } }
```

**Response:**

```json
{
  "screen": { "name": "enter-password", "action": "/u2/screen/enter-password?state=abc123", ... },
  "screenId": "enter-password",
  "navigateUrl": "/u2/enter-password?state=abc123"
}
```

The widget renders the new screen and updates the browser URL to `/u2/enter-password?state=abc123` without a page reload.

## Quick Start

### Installation

```bash
npm install @authhero/widget
# or
pnpm add @authhero/widget
```

### Basic Example

```html
<!DOCTYPE html>
<html>
  <head>
    <script type="module" src="/widget/authhero-widget.esm.js"></script>
  </head>
  <body>
    <authhero-widget api-url="/u/flow/login/screen" auto-submit="true">
    </authhero-widget>

    <script>
      const widget = document.querySelector("authhero-widget");

      widget.addEventListener("flowComplete", (e) => {
        if (e.detail.redirectUrl) {
          window.location.href = e.detail.redirectUrl;
        }
      });
    </script>
  </body>
</html>
```

## Further Reading

- [Universal Login Flows](/api/flows) - Complete flow documentation
- [Auth0 Forms API](/api/forms) - Forms API reference
- [StencilJS Documentation](https://stenciljs.com/) - Web component framework
