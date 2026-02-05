---
title: Getting Started
description: Installation and basic usage of the AuthHero UI Widget
---

# Getting Started

Learn how to install and use the AuthHero UI Widget in your application.

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

## Usage Modes

The widget supports three primary modes of operation:

### 1. Event-Based (Default)

The widget emits events and your application handles all HTTP requests and navigation:

```html
<authhero-widget api-url="/u2/screen/identifier" state="your-state-token">
</authhero-widget>

<script>
  const widget = document.querySelector("authhero-widget");

  widget.addEventListener("formSubmit", async (e) => {
    // Your app handles the submission
    const response = await fetch(e.detail.screen.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: e.detail.data }),
    });
    const result = await response.json();
    widget.screen = result.screen;
  });

  widget.addEventListener("buttonClick", (e) => {
    if (e.detail.type === "SOCIAL") {
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
  auto-navigate="true"
>
</authhero-widget>

<script>
  const widget = document.querySelector("authhero-widget");

  // Only need to handle flow completion
  widget.addEventListener("flowComplete", (e) => {
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
  state-persistence="session"
>
</authhero-widget>
```

## Next Steps

- Learn about [SSR & Hydration](./ssr-hydration) for optimal performance
- Explore [Integration Patterns](./integration-patterns) for different use cases
- Check out [Props & Events](./props-events) for the complete API reference
