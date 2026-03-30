---
title: Integration Patterns
description: Different ways to integrate the AuthHero UI Widget in your application
---

# Integration Patterns

The widget supports multiple integration patterns depending on your use case.

## 1. Event-Based Integration (Recommended)

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

## 2. Auto-Submit Mode

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
  auto-navigate="true"
>
</authhero-widget>

<script>
  const widget = document.querySelector("authhero-widget");

  widget.addEventListener("flowComplete", (e) => {
    if (e.detail.redirectUrl) {
      window.location.href = e.detail.redirectUrl;
    }
  });

  widget.addEventListener("flowError", (e) => {
    console.error("Auth error:", e.detail.message);
  });
</script>
```

## 3. Auth0 SPA SDK Integration

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

## 4. Custom Token Management

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

## 5. Generic Forms (Non-Auth)

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
