---
title: Client-Server Protocol
description: How the AuthHero widget communicates with the server using JSON-based SDUI protocol
---

# Client-Server Protocol

The AuthHero widget implements a custom **Server-Driven UI (SDUI)** protocol for authentication flows. This is not a StencilJS feature—it's a custom implementation built on top of the web component framework.

## Overview

The protocol enables:

- **Single-page app experience** without full page reloads
- **Browser navigation** (back/forward buttons work correctly)
- **Bookmarkable URLs** for each screen in the flow
- **Progressive enhancement** with HTML fallback for no-JS scenarios

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
├─────────────────────────────────────────────────────────────────┤
│  URL: /u2/login/identifier?state=...                            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   authhero-widget                            ││
│  │  ┌─────────────────┐  ┌──────────────────────────────────┐  ││
│  │  │ Form Rendering  │  │ Event Handling                    │  ││
│  │  │ (from screen)   │  │ - formSubmit → POST to action    │  ││
│  │  │                 │  │ - Update screen from response    │  ││
│  │  │                 │  │ - history.pushState(navigateUrl) │  ││
│  │  └─────────────────┘  └──────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ POST /u2/screen/:screenId?state=...
                              │ { data: { username: "..." } }
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Server                                   │
├─────────────────────────────────────────────────────────────────┤
│  Screen API (/u2/screen/:screenId)                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 1. Validate form data                                        ││
│  │ 2. Execute authentication logic                              ││
│  │ 3. Return next screen OR redirect                            ││
│  │ 4. Include navigateUrl for browser URL update                ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Request Format

When `auto-submit="true"` is set, the widget automatically handles form submissions by POSTing JSON to the screen's action URL:

```http
POST /u2/screen/identifier?state=01KH900EPSESH87KXD0NW5HJ12
Content-Type: application/json
Accept: application/json

{
  "data": {
    "username": "user@example.com"
  }
}
```

### Request Details

| Field          | Description                                      |
| -------------- | ------------------------------------------------ |
| URL Path       | `/u2/screen/:screenId` - The screen API endpoint |
| Query: `state` | Login session identifier (required)              |
| Body: `data`   | Form field values keyed by component ID          |

The `data` object contains all form field values. The keys match the `id` property of each form component.

## Response Format

The server responds with one of three response types:

### 1. Next Screen Response

When the flow continues to another screen (HTTP 200):

```json
{
  "screen": {
    "name": "enter-password",
    "action": "/u2/screen/enter-password?state=01KH900EPSESH87KXD0NW5HJ12",
    "method": "POST",
    "title": "Enter Password",
    "components": [
      {
        "id": "password",
        "type": "PASSWORD",
        "label": "Password",
        "required": true
      },
      {
        "id": "submit",
        "type": "NEXT_BUTTON",
        "config": { "text": "Continue" }
      }
    ],
    "links": [
      {
        "id": "forgot-password",
        "text": "Forgot password?",
        "href": "/u2/forgot-password?state=01KH900EPSESH87KXD0NW5HJ12"
      }
    ]
  },
  "branding": {
    "logo_url": "https://example.com/logo.png",
    "colors": { "primary": "#635dff" }
  },
  "screenId": "enter-password",
  "navigateUrl": "/u2/enter-password?state=01KH900EPSESH87KXD0NW5HJ12"
}
```

| Field               | Description                                    |
| ------------------- | ---------------------------------------------- |
| `screen`            | UI configuration for the next screen           |
| `screen.action`     | API endpoint for the next form submission      |
| `screen.components` | Form fields and buttons to render              |
| `screen.links`      | Navigation links (forgot password, back, etc.) |
| `screenId`          | Identifier for the new screen                  |
| `navigateUrl`       | User-facing URL to show in browser address bar |
| `branding`          | Optional branding configuration updates        |

### 2. Redirect Response

When authentication completes successfully (HTTP 200):

```json
{
  "redirect": "https://app.example.com/callback?code=abc123&state=xyz789"
}
```

The widget will:

1. Emit a `flowComplete` event with `{ redirectUrl: "..." }`
2. If `auto-navigate="true"`, automatically redirect via `window.location.href`

### 3. Validation Error Response

When form validation fails (HTTP 400):

```json
{
  "screen": {
    "name": "identifier",
    "action": "/u2/screen/identifier?state=01KH900EPSESH87KXD0NW5HJ12",
    "components": [
      {
        "id": "username",
        "type": "TEXT",
        "label": "Email",
        "hint": "Please enter a valid email address"
      }
    ]
  },
  "screenId": "identifier"
}
```

The response includes the same screen with error hints on the relevant components. Note: no `navigateUrl` is returned since the user stays on the same screen.

## URL Navigation

The protocol uses two different URL patterns:

| URL Type            | Pattern                               | Purpose                        |
| ------------------- | ------------------------------------- | ------------------------------ |
| **User-facing URL** | `/u2/enter-password?state=...`        | Shown in browser address bar   |
| **API URL**         | `/u2/screen/enter-password?state=...` | Used for JSON form submissions |

### Why Two URL Patterns?

1. **Clean URLs** - Users see `/u2/enter-password` not `/u2/screen/enter-password`
2. **Content negotiation** - User-facing URLs serve HTML pages; API URLs serve JSON
3. **Progressive enhancement** - HTML URLs work without JavaScript

### How URL Updates Work

When `auto-navigate="true"` is set:

1. **Form Submit**: Widget POSTs to `screen.action` (API URL)
2. **Server Response**: Includes `navigateUrl` (user-facing URL)
3. **URL Update**: Widget calls `history.pushState()` with `navigateUrl`
4. **No Page Reload**: Screen updates in-place via JavaScript

```typescript
// Widget implementation (simplified)
if (result.navigateUrl && this.shouldAutoNavigate) {
  window.history.pushState(
    { screen: result.screenId, state: this.state },
    "",
    result.navigateUrl,
  );
}
```

### Browser Navigation Support

The `history.pushState()` call enables:

- **Back Button**: Returns to previous screen
- **Forward Button**: Goes to next screen (if available)
- **Page Refresh**: Loads the correct screen from the user-facing URL
- **Bookmarks**: Each screen has a unique, shareable URL

## Complete Flow Example

### Sequence Diagram

```
┌──────────┐                         ┌──────────┐
│  Widget  │                         │  Server  │
└────┬─────┘                         └────┬─────┘
     │                                    │
     │  User enters email, clicks Continue│
     │                                    │
     │  POST /u2/screen/identifier        │
     │  { data: { username: "user@..." }} │
     │───────────────────────────────────>│
     │                                    │
     │                    Validate email  │
     │                    Look up user    │
     │                    Determine flow  │
     │                                    │
     │    200 OK                          │
     │    { screen: {...},                │
     │      screenId: "enter-password",   │
     │      navigateUrl: "/u2/enter-..." }│
     │<───────────────────────────────────│
     │                                    │
     │  Update UI with password screen    │
     │  history.pushState("/u2/enter-...")│
     │                                    │
     │  User enters password, clicks Continue
     │                                    │
     │  POST /u2/screen/enter-password    │
     │  { data: { password: "..." }}      │
     │───────────────────────────────────>│
     │                                    │
     │                    Verify password │
     │                    Create session  │
     │                    Generate code   │
     │                                    │
     │    200 OK                          │
     │    { redirect: "https://app/cb..." }
     │<───────────────────────────────────│
     │                                    │
     │  Emit flowComplete event           │
     │  window.location.href = redirect   │
     │                                    │
```

### Step-by-Step Breakdown

1. **Initial Page Load**
   - User visits `/u2/login/identifier?state=abc123`
   - Server renders HTML with SSR'd widget
   - Widget hydrates, `screen.action` = `/u2/screen/identifier?state=abc123`

2. **Email Submission**
   - User enters email, clicks Continue
   - Widget POSTs `{ data: { username: "user@example.com" } }` to action URL
   - Server validates, returns enter-password screen
   - Widget updates UI, calls `history.pushState("/u2/enter-password?state=abc123")`

3. **Password Submission**
   - User enters password, clicks Continue
   - Widget POSTs `{ data: { password: "..." } }` to action URL
   - Server verifies, returns `{ redirect: "..." }`
   - Widget emits `flowComplete`, redirects to callback URL

## Implementation Details

### Server-Side (screen-api.ts)

The server generates `navigateUrl` by extracting the screen ID from the next screen's action URL:

```typescript
// Extract screen ID from action URL
const nextScreenId =
  screenData.screen.action?.match(/\/u2\/(?:screen\/)?([^/?]+)/)?.[1] ||
  screenId;

// Build user-facing URL (only if screen changed)
const navigateUrl =
  nextScreenId !== screenId
    ? `/u2/${nextScreenId}?state=${encodeURIComponent(state)}`
    : undefined;

return {
  screen: {
    ...screenData.screen,
    action: `/u2/screen/${nextScreenId}?state=...`,
  },
  screenId: nextScreenId,
  navigateUrl,
};
```

### Client-Side (authhero-widget.tsx)

The widget handles the response and updates the URL:

```typescript
private handleSubmit = async (e: Event) => {
  e.preventDefault();

  const response = await fetch(this._screen.action, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: this.formData }),
  });

  const result = await response.json();

  if (result.redirect) {
    this.flowComplete.emit({ redirectUrl: result.redirect });
    if (this.shouldAutoNavigate) {
      window.location.href = result.redirect;
    }
  } else if (result.screen) {
    this._screen = result.screen;
    this.screenId = result.screenId;

    // Update browser URL without page reload
    if (result.navigateUrl && this.shouldAutoNavigate) {
      window.history.pushState(
        { screen: result.screenId, state: this.state },
        "",
        result.navigateUrl,
      );
    }
  }
};
```

## Configuration

Enable automatic form handling and URL navigation:

```html
<authhero-widget
  state="abc123"
  auto-submit="true"
  auto-navigate="true"
></authhero-widget>
```

| Prop                   | Effect                                               |
| ---------------------- | ---------------------------------------------------- |
| `auto-submit="true"`   | Widget handles form POSTs and response processing    |
| `auto-navigate="true"` | Widget updates browser URL via `history.pushState()` |

Without these props, the widget only emits events and the consuming application must handle HTTP requests and navigation manually.
