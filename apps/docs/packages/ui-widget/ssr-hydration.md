---
title: SSR & Hydration
description: Server-side rendering and hydration guide for the AuthHero UI Widget
---

# Server-Side Rendering and Hydration

The widget supports full server-side rendering (SSR) with client-side hydration for optimal performance on hosted login pages. This architecture provides instant visual display with progressive enhancement.

## How SSR + Hydration Works

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

## Benefits of SSR + Hydration

| Benefit                          | Description                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| **Instant Display**              | Users see the login form immediately without waiting for JavaScript to load and execute |
| **No Flash of Unstyled Content** | Styles are included in the server response via Declarative Shadow DOM                   |
| **Progressive Enhancement**      | Forms work even if JavaScript fails to load (with `auto-submit="false"`)                |
| **Better Core Web Vitals**       | Lower LCP, reduced CLS, and faster Time to Interactive                                  |
| **Edge Runtime Compatible**      | Works on Cloudflare Workers, Vercel Edge, and other edge runtimes                       |

## Basic SSR Example

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

## Render Options

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

## Shadow DOM Serialization Modes

The `serializeShadowRoot` option controls how the shadow DOM is rendered:

### Declarative Shadow DOM (Recommended)

```typescript
serializeShadowRoot: "declarative-shadow-dom";
```

Uses the browser's native [Declarative Shadow DOM](https://developer.chrome.com/docs/css-ui/declarative-shadow-dom) feature. The shadow DOM is embedded directly in the HTML using `<template shadowrootmode="open">`, allowing the browser to construct the shadow tree during HTML parsing—before any JavaScript runs.

**Output example:**

```html
<authhero-widget>
  <template shadowrootmode="open">
    <style>
      /* component styles */
    </style>
    <form class="widget-form">
      <!-- form content -->
    </form>
  </template>
</authhero-widget>
```

### Scoped Mode

```typescript
serializeShadowRoot: "scoped";
```

Renders content without shadow DOM, using scoped CSS class names instead. The actual shadow DOM is created during client-side hydration. This mode is useful for older browsers that don't support Declarative Shadow DOM.

### Mixed Mode

```typescript
serializeShadowRoot: {
  'declarative-shadow-dom': ['authhero-widget'],
  'scoped': ['legacy-component'],
  default: 'declarative-shadow-dom'
}
```

Allows different serialization modes for different components.

## Complete Hono Example

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
    },
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

## Edge Runtime Compatibility

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

## Avoiding Hydration Mismatches

Hydration mismatches occur when the server-rendered HTML differs from what the client expects. This causes a flash of content or console warnings.

**Common causes and solutions:**

| Issue                     | Solution                                  |
| ------------------------- | ----------------------------------------- |
| Different `screen` data   | Use the same data on server and client    |
| Date/time rendering       | Avoid rendering current time in SSR       |
| Browser-only conditionals | Don't use `window` checks in render logic |
| Unescaped JSON            | Escape `'` as `&#39;` in HTML attributes  |
| Random IDs                | Use deterministic IDs based on content    |

**Example: Proper attribute escaping**

```typescript
// ❌ Wrong - single quotes break the attribute
screen='${JSON.stringify(screen)}'

// ✅ Correct - escape single quotes
screen='${JSON.stringify(screen).replace(/'/g, "&#39;")}'
```

## Fallback for Non-SSR Environments

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
const finalHtml =
  widgetHtml ||
  `<authhero-widget screen='${screenJson}' auto-submit="true"></authhero-widget>`;
```

## Troubleshooting SSR Hydration Mismatch

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
