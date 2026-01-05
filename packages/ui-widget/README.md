# @authhero/widget

A Server-Driven UI widget for AuthHero authentication flows. Built with [StencilJS](https://stenciljs.com/) for framework-agnostic web components.

## Features

- **Auth0 Forms Compatible**: Uses Auth0's Forms API schema for universal login flows
- **Server-Driven UI (SDUI)**: The server controls what UI elements to render
- **Zero-Deploy Updates**: Update your auth flows without redeploying the widget
- **Event-Based Architecture**: Pure UI component that emits events for auth library integration
- **Framework Agnostic**: Works with React, Vue, Angular, or vanilla JS
- **Customizable**: Supports branding via CSS custom properties
- **SSR Support**: Includes hydrate scripts for server-side rendering

## Installation

```bash
pnpm add @authhero/widget
```

## Usage

### Browser (CDN)

```html
<script type="module" src="https://unpkg.com/@authhero/widget/dist/authhero-widget/authhero-widget.esm.js"></script>

<authhero-widget 
  api-url="/u/flow/screen"
  auto-submit="false">
</authhero-widget>
```

### With a JavaScript Framework

```javascript
import '@authhero/widget';

// Or with the loader for lazy-loading
import { defineCustomElements } from '@authhero/widget/loader';
defineCustomElements();
```

```html
<authhero-widget 
  api-url="/u/flow/screen"
  auto-submit="false">
</authhero-widget>
```

### Server-Side Rendering (Hono)

```typescript
import { renderToString } from '@authhero/widget/hydrate';

const html = await renderToString(`
  <authhero-widget screen='${JSON.stringify(screenConfig)}'></authhero-widget>
`);
```

## UI Schema (Auth0 Forms API)

The widget renders UI based on Auth0's Forms API schema for universal login flows.

### Component Types

The widget supports [27+ Auth0 component types](https://auth0.com/docs/authenticate/login/auth0-universal-login/new-experience/universal-login-page-templates):

| Component | Description |
|-----------|-------------|
| `heading` | Page headings and titles |
| `description` | Descriptive text |
| `text-input` | Text, email, phone inputs |
| `password-input` | Password field with show/hide toggle |
| `checkbox-input` | Checkboxes |
| `select-input` | Dropdown selects |
| `submit-button` | Primary action buttons |
| `button` | Secondary action buttons |
| `social-button-group` | Social login buttons |
| `anchor` | Links and navigation |
| `separator` | Visual dividers |
| `image` | Logos and images |
| And more... | Phone input, captcha, MFA, etc. |

### Screen Configuration

```typescript
interface UIScreen {
  title?: string;                // Screen title
  description?: string;          // Screen description
  components: UIComponent[];     // UI components to render
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    backgroundColor?: string;
  };
  theme?: string;                // Theme configuration JSON
}

interface UIComponent {
  component: string;             // Component type (e.g., 'text-input', 'submit-button')
  id: string;                    // Component identifier
  label?: string;                // Display label
  [key: string]: any;            // Component-specific props
}
```

### Example: Login Screen

```json
{
  "title": "Sign in to your account",
  "components": [
    {
      "component": "heading",
      "id": "heading",
      "content": "Welcome back"
    },
    {
      "component": "text-input",
      "id": "email",
      "name": "email",
      "label": "Email address",
      "type": "email",
      "required": true,
      "autocomplete": "email"
    },
    {
      "component": "password-input",
      "id": "password",
      "name": "password",
      "label": "Password",
      "required": true,
      "autocomplete": "current-password"
    },
    {
      "component": "submit-button",
      "id": "submit",
      "label": "Continue",
      "action": "submit"
    },
    {
      "component": "anchor",
      "id": "forgot",
      "content": "Forgot password?",
      "href": "/forgot-password"
    }
  ]
}
```

### Social Login

Social buttons are configured using the `social-button-group` component:

```json
{
  "component": "social-button-group",
  "id": "social",
  "connections": [
    {
      "name": "google-oauth2",
      "label": "Continue with Google"
    },
    {
      "name": "github",
      "label": "Continue with GitHub"
    }
  ]
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `screen` | `string \| UIScreen` | - | Screen configuration (JSON string or object) |
| `api-url` | `string` | - | API endpoint for screen fetching |
| `branding` | `string \| Branding` | - | Branding configuration |
| `theme` | `string` | - | Theme configuration JSON |
| `loading` | `boolean` | `false` | Loading state |
| `auto-submit` | `boolean` | `false` | Auto-submit forms (not recommended, use events instead) |

## Events

The widget is a **pure UI component** that emits events for your auth library to handle. It does not manage tokens, sessions, or HTTP requests.

| Event | Detail | Description |
|-------|--------|-------------|
| `formSubmit` | `{ data: FormData, screen: UIScreen }` | Form submitted by user |
| `buttonClick` | `{ id: string, action: string }` | Button clicked |
| `linkClick` | `{ href: string }` | Link clicked |
| `navigate` | `{ to: string }` | Navigation requested |
| `flowComplete` | `{ result: any }` | Auth flow completed successfully |
| `flowError` | `{ error: Error }` | Auth flow error occurred |
| `screenChange` | `UIScreen` | Screen changed |

### Event-Based Integration (Recommended)

The recommended approach is to handle events and let your auth library manage the flow:

```javascript
const widget = document.querySelector('authhero-widget');

widget.addEventListener('formSubmit', async (e) => {
  const { data, screen } = e.detail;
  
  try {
    // Your auth library handles the HTTP request
    const response = await fetch('/u/flow/screen', {
      method: 'POST',
      body: data,
    });
    
    const nextScreen = await response.json();
    widget.screen = JSON.stringify(nextScreen);
  } catch (error) {
    widget.dispatchEvent(new CustomEvent('flowError', { detail: { error } }));
  }
});

widget.addEventListener('linkClick', (e) => {
  // Handle navigation
  window.location.href = e.detail.href;
});
```

### Auto-Submit Mode (Not Recommended)

For simple use cases, the widget can handle HTTP requests automatically:

```html
<authhero-widget 
  api-url="/u/flow/screen"
  auto-submit="true">
</authhero-widget>
```

⚠️ **Note**: Auto-submit mode is provided for convenience but is not recommended for production. Use the event-based approach for proper error handling, token management, and integration with auth libraries like Auth0 SPA SDK.
```

## Customization

### CSS Custom Properties

```css
authhero-widget {
  --primary-color: #0066cc;
  --background-color: #ffffff;
  --text-color: #333333;
  --border-radius: 8px;
}
```

### Server-Side Branding

Include branding in the screen configuration:

```json
{
  "branding": {
    "logoUrl": "https://example.com/logo.png",
    "primaryColor": "#ff6600",
    "backgroundColor": "#f5f5f5"
  },
  "components": [...]
}
```

## Integration Patterns

See [`packages/authhero/FLOWS.md`](../authhero/FLOWS.md) for detailed integration patterns including:

1. **Event-Based (Recommended)** - Full control with auth libraries like Auth0 SPA SDK
2. **Auto-Submit Mode** - Simple hosted page integration
3. **Auth0 SPA SDK Integration** - Using `loginWithRedirect()` and callback handling
4. **Custom Token Management** - Custom refresh token and session handling
5. **Generic Forms** - Non-auth form use cases
```

## Development

```bash
# Install dependencies
pnpm install

# Start development server (runs Stencil build + demo server)
pnpm dev

# Run demo server only (requires built widget)
pnpm demo

# Build for production
pnpm build

# Run tests
pnpm test
```

### Demo Server

The widget includes a demo server at `demo-server/server.ts` that provides:

- **Live Settings Panel**: Test all theme and branding options in real-time
- **Mock Authentication Flow**: Test identifier → code entry → success screens
- **Server-Driven UI**: Demonstrates how the widget integrates with a backend

When you run `pnpm dev`, the demo is available at:
- Path-based: http://localhost:3456/u2/login/identifier
- Query-based: http://localhost:3456/u2/login?screen=identifier

The demo server provides:
- `GET /u2/screen/:screenId` - Returns screen configuration
- `POST /u2/screen/:screenId` - Processes form submissions and returns next screen
- Settings panel to customize theme, branding, and widget options

## License

MIT
