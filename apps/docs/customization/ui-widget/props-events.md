---
title: Props & Events
description: Complete reference for AuthHero UI Widget properties and events
---

# Props & Events

Complete reference for widget properties and events.

## Widget Props

| Prop                | Type                             | Default             | Description                                                                  |
| ------------------- | -------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| `screen`            | `string \| UIScreen`             | -                   | Screen configuration to render (JSON string or object)                       |
| `api-url`           | `string`                         | -                   | API endpoint to fetch initial screen from. Supports `{screenId}` placeholder |
| `base-url`          | `string`                         | -                   | Base URL for all API calls (for cross-domain embedding)                      |
| `branding`          | `string \| Branding`             | -                   | Branding configuration (logo, colors, fonts)                                 |
| `theme`             | `string`                         | -                   | Theme configuration JSON                                                     |
| `loading`           | `boolean`                        | `false`             | Show loading state                                                           |
| `auto-submit`       | `boolean`                        | `false`             | Auto-handle form submissions to the action URL                               |
| `auto-navigate`     | `boolean`                        | `false`             | Auto-handle social login redirects, links, and navigation                    |
| `state`             | `string`                         | -                   | Login session state token (required for auth flows)                          |
| `screen-id`         | `string`                         | -                   | Current screen ID for API fetching                                           |
| `auth-params`       | `string`                         | -                   | OAuth params JSON for social login (client_id, redirect_uri, etc.)           |
| `state-persistence` | `'url' \| 'session' \| 'memory'` | `'memory'`          | Where to persist state and screen ID                                         |
| `storage-key`       | `string`                         | `'authhero_widget'` | Storage key prefix for session persistence                                   |

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

## Event Examples

### Handling Form Submissions

```typescript
const widget = document.querySelector("authhero-widget");

widget.addEventListener("formSubmit", async (e) => {
  const { screen, data } = e.detail;

  widget.loading = true;
  try {
    const response = await fetch(screen.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });

    const result = await response.json();

    if (result.redirect) {
      window.location.href = result.redirect;
    } else {
      widget.screen = JSON.stringify(result.screen);
    }
  } catch (error) {
    console.error("Form submission failed:", error);
  } finally {
    widget.loading = false;
  }
});
```

### Handling Social Login

```typescript
widget.addEventListener("buttonClick", (e) => {
  const { action, value } = e.detail;

  if (action === "social-login") {
    // Redirect to social provider
    window.location.href = `/authorize?connection=${value}&state=${loginTicket}`;
  }
});
```

### Handling Navigation

```typescript
widget.addEventListener("linkClick", (e) => {
  const { href, text } = e.detail;

  // Navigate to the link destination
  window.location.href = href;
});

widget.addEventListener("navigate", (e) => {
  const { to } = e.detail;

  // Handle internal navigation
  router.push(to);
});
```

### Handling Flow Completion

```typescript
widget.addEventListener("flowComplete", (e) => {
  const { redirectUrl, result } = e.detail;

  if (redirectUrl) {
    // Redirect to callback URL with auth code
    window.location.href = redirectUrl;
  } else if (result) {
    // Handle direct result (e.g., tokens)
    console.log("Authentication complete:", result);
  }
});
```

### Handling Errors

```typescript
widget.addEventListener("flowError", (e) => {
  const { error, message } = e.detail;

  console.error("Authentication error:", message || error.message);

  // Show user-friendly error message
  showErrorNotification(message || "An error occurred during authentication");
});
```

### Tracking Screen Changes

```typescript
widget.addEventListener("screenChange", (e) => {
  const screen = e.detail;

  console.log("Screen changed to:", screen.id);

  // Track analytics
  analytics.track("auth_screen_view", { screen_id: screen.id });
});
```
