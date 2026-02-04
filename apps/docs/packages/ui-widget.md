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

## Installation

```bash
npm install @authhero/widget
# or
pnpm add @authhero/widget
```

## Basic Usage

### Hosted Login Page

For server-rendered hosted login pages:

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
      // Extract state from URL
      const params = new URLSearchParams(window.location.search);
      const state = params.get("state");

      const widget = document.querySelector("authhero-widget");

      // Widget auto-fetches screen and handles submissions
      widget.addEventListener("flowComplete", (e) => {
        if (e.detail.redirectUrl) {
          window.location.href = e.detail.redirectUrl;
        }
      });
    </script>
  </body>
</html>
```

### Client Application (SPA)

For embedding in your own application:

```javascript
import "@authhero/widget";

const widget = document.createElement("authhero-widget");
widget.setAttribute("auto-submit", "false"); // Handle events manually

document.body.appendChild(widget);

// Extract state from OAuth flow
const params = new URLSearchParams(window.location.search);
const loginTicket = params.get("state");

// Fetch initial screen
const response = await fetch(`/u/flow/screen?form=login&state=${loginTicket}`);
const { screen, branding } = await response.json();

widget.screen = JSON.stringify(screen);
widget.branding = JSON.stringify(branding);

// Handle form submissions
widget.addEventListener("formSubmit", async (e) => {
  const { data } = e.detail;

  const response = await fetch(
    `/u/flow/screen?form=login&state=${loginTicket}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    },
  );

  const result = await response.json();

  if (result.redirect) {
    window.location.href = result.redirect;
  } else {
    widget.screen = JSON.stringify(result.screen);
  }
});
```

## Server-Side Rendering and Hydration

The widget supports full server-side rendering (SSR) with client-side hydration for optimal performance on hosted login pages. This architecture provides instant visual display with progressive enhancement.

### How SSR + Hydration Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SSR + Hydration Flow                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Server Phase                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Request → Fetch Screen Data → renderToString() → HTML Response    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  2. Browser Receives HTML (User sees content immediately)                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  <authhero-widget>                                                  │   │
│  │    <template shadowrootmode="open">  ← Declarative Shadow DOM      │   │
│  │      <style>...</style>                                             │   │
│  │      <form>...</form>  ← Visible instantly, not yet interactive    │   │
│  │    </template>                                                      │   │
│  │  </authhero-widget>                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  3. JavaScript Loads + Hydration                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Widget ESM bundle loads → Attaches event listeners →              │   │
│  │  Component becomes fully interactive                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Benefits of SSR + Hydration

| Benefit | Description |
|---------|-------------|
| **Instant Display** | Users see the login form immediately without waiting for JavaScript to load and execute |
| **No Flash of Unstyled Content** | Styles are included in the server response via Declarative Shadow DOM |
| **Progressive Enhancement** | Forms work even if JavaScript fails to load (with `auto-submit="false"`) |
| **Better Core Web Vitals** | Lower LCP, reduced CLS, and faster Time to Interactive |
| **Edge Runtime Compatible** | Works on Cloudflare Workers, Vercel Edge, and other edge runtimes |

### Basic SSR Example

```typescript
import { renderToString } from "@authhero/widget/hydrate";

// Fetch screen data
const { screen, branding } = await fetchScreen(formId, state);

// Render widget HTML on the server
const widgetResult = await renderToString(`
  <authhero-widget 
    screen='${JSON.stringify(screen)}'
    branding='${JSON.stringify(branding)}'
    auto-submit="true">
  </authhero-widget>
`);

// Include in page HTML
const html = `
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="/widget/authhero-widget.esm.js"></script>
</head>
<body>
  ${widgetResult.html}
</body>
</html>
`;
```

### Render Options

The `renderToString` function accepts options to control rendering behavior:

```typescript
import { renderToString } from "@authhero/widget/hydrate";

const result = await renderToString(html, {
  // Return only the component HTML, not a full document
  fullDocument: false,
  
  // Shadow DOM rendering mode (see below)
  serializeShadowRoot: "declarative-shadow-dom",
  
  // Remove CSS not used by rendered components
  removeUnusedStyles: true,
  
  // Format output for debugging
  prettyHtml: false,
  
  // Remove script tags from output
  removeScripts: false,
  
  // Timeout for rendering (default: 15000ms)
  timeout: 15000,
});

// result.html - The rendered HTML string
// result.diagnostics - Any warnings or errors
// result.hydratedCount - Number of components rendered
```

### Shadow DOM Serialization Modes

The `serializeShadowRoot` option controls how the shadow DOM is rendered:

#### Declarative Shadow DOM (Recommended)

```typescript
serializeShadowRoot: "declarative-shadow-dom"
```

Uses the browser's native [Declarative Shadow DOM](https://developer.chrome.com/docs/css-ui/declarative-shadow-dom) feature. The shadow DOM is embedded directly in the HTML using `<template shadowrootmode="open">`, allowing the browser to construct the shadow tree during HTML parsing—before any JavaScript runs.

**Output example:**
```html
<authhero-widget>
  <template shadowrootmode="open">
    <style>/* component styles */</style>
    <form class="widget-form">
      <!-- form content -->
    </form>
  </template>
</authhero-widget>
```

#### Scoped Mode

```typescript
serializeShadowRoot: "scoped"
```

Renders content without shadow DOM, using scoped CSS class names instead. The actual shadow DOM is created during client-side hydration. This mode is useful for older browsers that don't support Declarative Shadow DOM.

#### Mixed Mode

```typescript
serializeShadowRoot: {
  'declarative-shadow-dom': ['authhero-widget'],
  'scoped': ['legacy-component'],
  default: 'declarative-shadow-dom'
}
```

Allows different serialization modes for different components.

### Complete Hono Example

```typescript
import { Hono } from "hono";
import { renderToString } from "@authhero/widget/hydrate";

const app = new Hono();

app.get("/u2/login/:screenId", async (c) => {
  const screenId = c.req.param("screenId");
  const state = c.req.query("state");
  
  // Fetch screen data from your backend
  const { screen, branding, theme } = await getScreenData(screenId, state);
  
  // Escape single quotes for HTML attributes
  const escapeAttr = (json: string) => json.replace(/'/g, "&#39;");
  
  // Server-side render the widget
  const widgetResult = await renderToString(
    `<authhero-widget
      screen='${escapeAttr(JSON.stringify(screen))}'
      branding='${escapeAttr(JSON.stringify(branding))}'
      theme='${escapeAttr(JSON.stringify(theme))}'
      state="${state}"
      auto-submit="true"
      auto-navigate="true"
    ></authhero-widget>`,
    {
      fullDocument: false,
      serializeShadowRoot: "declarative-shadow-dom",
    }
  );

  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login</title>
      <!-- Widget script for hydration -->
      <script type="module" src="/widget/authhero-widget.esm.js"></script>
    </head>
    <body>
      ${widgetResult.html}
      
      <script>
        // Handle flow completion
        document.querySelector('authhero-widget')
          .addEventListener('flowComplete', (e) => {
            if (e.detail.redirectUrl) {
              window.location.href = e.detail.redirectUrl;
            }
          });
      </script>
    </body>
    </html>
  `);
});
```

### Edge Runtime Compatibility

The hydrate module works on edge runtimes (Cloudflare Workers, Vercel Edge, etc.). For maximum compatibility:

```typescript
// Ensure window global exists for Stencil's internal checks
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

// Use dynamic import for the hydrate module
const { renderToString } = await import("@authhero/widget/hydrate");

const result = await renderToString(widgetHtml, {
  fullDocument: false,
  serializeShadowRoot: "declarative-shadow-dom",
});
```

### Avoiding Hydration Mismatches

Hydration mismatches occur when the server-rendered HTML differs from what the client expects. This causes a flash of content or console warnings.

**Common causes and solutions:**

| Issue | Solution |
|-------|----------|
| Different `screen` data | Use the same data on server and client |
| Date/time rendering | Avoid rendering current time in SSR |
| Browser-only conditionals | Don't use `window` checks in render logic |
| Unescaped JSON | Escape `'` as `&#39;` in HTML attributes |
| Random IDs | Use deterministic IDs based on content |

**Example: Proper attribute escaping**
```typescript
// ❌ Wrong - single quotes break the attribute
screen='${JSON.stringify(screen)}'

// ✅ Correct - escape single quotes
screen='${JSON.stringify(screen).replace(/'/g, "&#39;")}'
```

### Fallback for Non-SSR Environments

If SSR fails (e.g., in an environment where the hydrate module can't run), the widget gracefully falls back to client-side rendering:

```typescript
let widgetHtml = "";

try {
  const { renderToString } = await import("@authhero/widget/hydrate");
  const result = await renderToString(/* ... */);
  widgetHtml = result.html || "";
} catch (error) {
  console.error("SSR failed, falling back to CSR:", error);
  // widgetHtml remains empty - widget will render client-side
}

// The widget tag is still included, it will self-render on the client
const finalHtml = widgetHtml || 
  `<authhero-widget screen='${screenJson}' auto-submit="true"></authhero-widget>`;
```

## Widget Props

| Prop          | Type                 | Default | Description                                             |
| ------------- | -------------------- | ------- | ------------------------------------------------------- |
| `screen`      | `string \| UIScreen` | -       | Screen configuration to render (JSON string or object)  |
| `api-url`     | `string`             | -       | API endpoint to fetch initial screen from. Supports `{screenId}` placeholder |
| `base-url`    | `string`             | -       | Base URL for all API calls (for cross-domain embedding) |
| `branding`    | `string \| Branding` | -       | Branding configuration (logo, colors, fonts)            |
| `theme`       | `string`             | -       | Theme configuration JSON                                |
| `loading`     | `boolean`            | `false` | Show loading state                                      |
| `auto-submit` | `boolean`            | `false` | Auto-handle form submissions to the action URL          |
| `auto-navigate` | `boolean`          | `false` | Auto-handle social login redirects, links, and navigation |
| `state`       | `string`             | -       | Login session state token (required for auth flows)     |
| `screen-id`   | `string`             | -       | Current screen ID for API fetching                      |
| `auth-params` | `string`             | -       | OAuth params JSON for social login (client_id, redirect_uri, etc.) |
| `state-persistence` | `'url' \| 'session' \| 'memory'` | `'memory'` | Where to persist state and screen ID |
| `storage-key` | `string`             | `'authhero_widget'` | Storage key prefix for session persistence |

## Usage Modes

The widget supports three primary modes of operation:

### 1. Event-Based (Default)

The widget emits events and your application handles all HTTP requests and navigation:

```html
<authhero-widget 
  api-url="/u2/screen/identifier"
  state="your-state-token">
</authhero-widget>

<script>
  const widget = document.querySelector('authhero-widget');
  
  widget.addEventListener('formSubmit', async (e) => {
    // Your app handles the submission
    const response = await fetch(e.detail.screen.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: e.detail.data }),
    });
    const result = await response.json();
    widget.screen = result.screen;
  });
  
  widget.addEventListener('buttonClick', (e) => {
    if (e.detail.type === 'SOCIAL') {
      // Handle social login redirect
    }
  });
</script>
```

### 2. Self-Contained (Universal Login Pages)

The widget handles everything internally - ideal for hosted login pages:

```html
<authhero-widget 
  api-url="/u2/screen/{screenId}"
  screen-id="identifier"
  state="your-state-token"
  auth-params='{"client_id":"abc123","redirect_uri":"https://app.example.com/callback"}'
  auto-submit="true"
  auto-navigate="true">
</authhero-widget>

<script>
  const widget = document.querySelector('authhero-widget');
  
  // Only need to handle flow completion
  widget.addEventListener('flowComplete', (e) => {
    if (e.detail.redirectUrl) {
      window.location.href = e.detail.redirectUrl;
    }
  });
</script>
```

### 3. Cross-Domain Embedded

Use `base-url` when embedding the widget on a different domain:

```html
<authhero-widget 
  base-url="https://auth.example.com"
  api-url="/u2/screen/{screenId}"
  screen-id="identifier"
  state="your-state-token"
  auth-params='{"client_id":"abc123"}'
  auto-submit="true"
  auto-navigate="true"
  state-persistence="session">
</authhero-widget>
```

## Widget Events

The widget is event-driven and emits the following custom events:

| Event          | Detail                                            | Description                                     |
| -------------- | ------------------------------------------------- | ----------------------------------------------- |
| `formSubmit`   | `{ screen: UIScreen, data: Record<string, any> }` | Form submitted with field values                |
| `buttonClick`  | `{ id: string, action: string, value?: string }`  | Button clicked (social login, navigation, etc.) |
| `linkClick`    | `{ href: string, text?: string }`                 | Link clicked                                    |
| `navigate`     | `{ to: string }`                                  | Navigation requested                            |
| `flowComplete` | `{ redirectUrl?: string, result?: any }`          | Auth flow completed successfully                |
| `flowError`    | `{ error: Error, message?: string }`              | Error occurred                                  |
| `screenChange` | `UIScreen`                                        | Screen was updated                              |

## Integration Patterns

The widget supports multiple integration patterns depending on your use case.

### 1. Event-Based Integration (Recommended)

This pattern gives you full control over the authentication flow. The widget emits events, and you handle HTTP requests with your preferred auth library.

**Best for:**

- SPAs with auth libraries like Auth0 SPA SDK
- Custom authentication flows
- Complex error handling requirements
- Token refresh and session management

**Example:**

```typescript
import "@authhero/widget";

const widget = document.querySelector("authhero-widget");
const loginTicket = new URLSearchParams(location.search).get("state");

widget.addEventListener("formSubmit", async (e) => {
  const { data } = e.detail;

  widget.loading = true;
  try {
    const response = await fetch(
      `/u/flow/screen?form=login&state=${loginTicket}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      },
    );

    const result = await response.json();

    if (result.redirect) {
      window.location.href = result.redirect;
    } else {
      widget.screen = JSON.stringify(result.screen);
    }
  } catch (error) {
    console.error("Login failed:", error);
  } finally {
    widget.loading = false;
  }
});

widget.addEventListener("buttonClick", (e) => {
  const { action, value } = e.detail;

  if (action === "social-login") {
    window.location.href = `/authorize?connection=${value}&state=${loginTicket}`;
  }
});

widget.addEventListener("linkClick", (e) => {
  window.location.href = e.detail.href;
});
```

### 2. Auto-Submit Mode

The widget automatically handles form submissions and screen transitions. With `auto-navigate`, it also handles social login redirects.

**Best for:**

- Simple hosted login pages
- Quick prototyping
- Minimal JavaScript requirements

**Example:**

```html
<authhero-widget 
  api-url="/u2/screen/{screenId}" 
  screen-id="identifier"
  state="your-state-token"
  auth-params='{"client_id":"test-client","redirect_uri":"https://app.example.com/callback"}'
  auto-submit="true"
  auto-navigate="true">
</authhero-widget>

<script>
  const widget = document.querySelector("authhero-widget");

  widget.addEventListener("flowComplete", (e) => {
    if (e.detail.redirectUrl) {
      window.location.href = e.detail.redirectUrl;
    }
  });

  widget.addEventListener("flowError", (e) => {
    console.error('Auth error:', e.detail.message);
  });
</script>
```

### 3. Auth0 SPA SDK Integration

Use the widget with Auth0's official SPA SDK for production applications.

**Best for:**

- Production SPAs
- OAuth/OIDC flows
- Token management and refresh
- Silent authentication

**Example:**

```typescript
import { Auth0Client } from "@auth0/auth0-spa-js";
import "@authhero/widget";

const auth0 = new Auth0Client({
  domain: "your-tenant.authhero.com",
  clientId: "your-client-id",
  cacheLocation: "localstorage",
});

// Check if returning from login
const params = new URLSearchParams(window.location.search);
if (params.has("code") && params.has("state")) {
  // Auth0 SDK handles the callback
  await auth0.handleRedirectCallback();
  window.history.replaceState({}, document.title, "/");
}

// Check authentication
const isAuthenticated = await auth0.isAuthenticated();

if (!isAuthenticated) {
  // Start login flow
  await auth0.loginWithRedirect({
    appState: { targetUrl: window.location.pathname },
  });
} else {
  // Get user info
  const user = await auth0.getUser();
  const token = await auth0.getTokenSilently();

  console.log("Logged in as:", user);
}
```

If you want to embed the widget directly instead of using `loginWithRedirect()`:

```typescript
// Get login ticket from authorize endpoint
const loginTicket = await initiateLogin(); // Your custom function

// Fetch initial screen
const response = await fetch(`/u/flow/screen?form=login&state=${loginTicket}`);
const { screen, branding } = await response.json();

const widget = document.querySelector("authhero-widget");
widget.screen = JSON.stringify(screen);
widget.branding = JSON.stringify(branding);

// Handle submissions
widget.addEventListener("formSubmit", async (e) => {
  const response = await fetch(
    `/u/flow/screen?form=login&state=${loginTicket}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: e.detail.data }),
    },
  );

  const result = await response.json();

  if (result.redirect) {
    // Redirect to callback - Auth0 SDK will handle it
    window.location.href = result.redirect;
  } else {
    widget.screen = JSON.stringify(result.screen);
  }
});
```

### 4. Custom Token Management

Handle tokens and sessions yourself without an auth library.

**Best for:**

- Custom authentication requirements
- Non-standard OAuth flows
- Direct API integration

**Example:**

```typescript
import "@authhero/widget";

const tokenStorage = {
  get: () => localStorage.getItem("access_token"),
  set: (token: string, refresh?: string) => {
    localStorage.setItem("access_token", token);
    if (refresh) localStorage.setItem("refresh_token", refresh);
  },
  clear: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  },
};

const widget = document.querySelector("authhero-widget");
const loginTicket = new URLSearchParams(location.search).get("state");

widget.addEventListener("formSubmit", async (e) => {
  const response = await fetch(
    `/u/flow/screen?form=login&state=${loginTicket}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: e.detail.data }),
    },
  );

  const result = await response.json();

  if (result.redirect) {
    // Parse callback URL for code
    const url = new URL(result.redirect);
    const code = url.searchParams.get("code");

    // Exchange code for tokens
    const tokenResponse = await fetch("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: "your-client-id",
        redirect_uri: window.location.origin + "/callback",
      }),
    });

    const tokens = await tokenResponse.json();
    tokenStorage.set(tokens.access_token, tokens.refresh_token);

    // Redirect to app
    window.location.href = "/app";
  } else {
    widget.screen = JSON.stringify(result.screen);
  }
});

// Token refresh
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("refresh_token");

  const response = await fetch("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: "your-client-id",
    }),
  });

  const tokens = await response.json();
  tokenStorage.set(tokens.access_token, tokens.refresh_token);

  return tokens.access_token;
}
```

### 5. Generic Forms (Non-Auth)

The widget can also be used for generic server-driven forms outside of authentication.

**Best for:**

- Multi-step forms
- Dynamic forms based on user input
- Survey flows
- Onboarding wizards

**Example:**

```typescript
import "@authhero/widget";

const widget = document.querySelector("authhero-widget");

// Initial form screen
widget.screen = JSON.stringify({
  title: "Contact Us",
  description: "We'd love to hear from you",
  components: [
    {
      component: "text-input",
      id: "name",
      name: "name",
      label: "Your Name",
      required: true,
    },
    {
      component: "text-input",
      id: "email",
      name: "email",
      label: "Email Address",
      type: "email",
      required: true,
    },
    {
      component: "submit-button",
      id: "submit",
      label: "Continue",
    },
  ],
});

widget.addEventListener("formSubmit", async (e) => {
  const { data } = e.detail;

  // Send to your backend
  const response = await fetch("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  // Show next screen (e.g., thank you message)
  widget.screen = JSON.stringify(result.nextScreen);
});
```

## Customization

### Branding

The widget supports full branding customization:

```typescript
widget.branding = JSON.stringify({
  logoUrl: "https://example.com/logo.png",
  primaryColor: "#6366f1",
  backgroundColor: "#ffffff",
  font: {
    url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap",
  },
});
```

### CSS Custom Properties

Override styles with CSS variables:

```css
authhero-widget {
  --primary-color: #0066cc;
  --background-color: #ffffff;
  --text-color: #333333;
  --border-radius: 8px;
  --font-family: "Inter", sans-serif;
}
```

### Theme Configuration

Advanced theming with component-level customization:

```typescript
widget.theme = JSON.stringify({
  button: {
    primary: {
      backgroundColor: "#6366f1",
      textColor: "#ffffff",
      borderRadius: "8px",
    },
  },
  input: {
    borderColor: "#e5e7eb",
    focusBorderColor: "#6366f1",
  },
});
```

## API Reference

### Screen Configuration

The widget renders screens based on the Auth0 Forms API schema:

```typescript
interface UIScreen {
  title?: string;
  description?: string;
  components: UIComponent[];
  messages?: Message[];
  branding?: Branding;
  theme?: string;
}

interface UIComponent {
  component: string; // e.g., 'text-input', 'submit-button', 'social-button-group'
  id: string;
  label?: string;
  [key: string]: any; // Component-specific props
}
```

### Supported Components

The widget supports [27+ Auth0 component types](https://auth0.com/docs/authenticate/login/auth0-universal-login/new-experience/universal-login-page-templates):

- `heading` - Page headings
- `description` - Descriptive text
- `text-input` - Text, email, phone inputs
- `password-input` - Password field with show/hide
- `checkbox-input` - Checkboxes
- `select-input` - Dropdown selects
- `submit-button` - Primary action buttons
- `button` - Secondary action buttons
- `social-button-group` - Social login buttons
- `anchor` - Links and navigation
- `separator` - Visual dividers
- `image` - Logos and images
- And more...

## Best Practices

### Security

- Always validate user input on the server
- Use HTTPS for all API requests
- Implement CSRF protection for hosted pages
- Never expose sensitive data in screen configurations
- Validate the `state` parameter to prevent session fixation

### Performance

- Use SSR for hosted pages to improve initial load time
- Lazy load the widget in SPAs if not immediately needed
- Cache branding and theme configurations
- Minimize screen transitions by combining related inputs

### User Experience

- Provide clear error messages from the server
- Show loading states during submissions
- Preserve form data when navigating between screens
- Support browser back/forward navigation
- Use appropriate `autocomplete` attributes

### Development

- Use the event-based pattern for better testability
- Handle errors gracefully and show user-friendly messages
- Log events for debugging and analytics
- Test with different screen configurations
- Validate screen schemas on the server

## Troubleshooting

### Widget Not Rendering

- Check that the script is loaded: `<script type="module" src="/widget/authhero-widget.esm.js"></script>`
- Verify the `screen` prop is valid JSON
- Check browser console for errors
- Ensure the widget is a child of `<body>` or a rendered element

### Form Not Submitting

- Verify `formSubmit` event listener is attached
- Check network tab for failed API requests
- Ensure the `state` parameter is valid and not expired
- Verify CORS settings if calling from a different domain

### Branding Not Applied

- Check that `branding` prop is valid JSON
- Verify image URLs are accessible
- Check CSS custom properties are not being overridden
- Inspect element to see computed styles

### SSR Hydration Mismatch

Hydration mismatches occur when server-rendered HTML differs from what the client expects:

- **Ensure consistent data**: Use the same `screen`, `branding`, and `theme` data for both SSR and client hydration
- **Avoid browser-only conditionals**: Don't use `window`, `document`, or `navigator` in render logic
- **Escape JSON properly**: Replace `'` with `&#39;` in HTML attributes: `screen='${json.replace(/'/g, "&#39;")}'`
- **Use deterministic IDs**: Avoid random IDs or timestamps in rendered content
- **Check script loading order**: Ensure the widget ESM bundle loads after the SSR HTML is in the DOM
- **Debug with console**: Check browser console for hydration warnings from StencilJS
- **Compare HTML**: Use browser DevTools to compare server HTML (View Source) with client DOM

**Common symptoms:**
- Flash of content after page load
- Console warnings about hydration mismatches
- Interactive features not working initially
- Style changes after JavaScript loads

## Examples

See the [demo app](/apps/demo/) for complete working examples of all integration patterns.

## Further Reading

- [Universal Login Flows](/api/flows) - Complete flow documentation
- [Auth0 Forms API](/api/forms) - Forms API reference
- [StencilJS Documentation](https://stenciljs.com/) - Web component framework
