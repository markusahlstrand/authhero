# Client-Side Hydration with Hono

This directory contains the client-side code for authentication pages, using **Hono's JSX/DOM** with proper hydration support.

## Overview

The authentication pages are **server-side rendered** for fast initial load, then **hydrated on the client** to add interactivity. This approach provides:

- ✅ Fast initial page load (no JavaScript needed for display)
- ✅ Progressive enhancement with client-side features
- ✅ Small bundle size (~3KB with Brotli)
- ✅ Type-safe React-like development experience

## Architecture

### Server-Side Rendering (SSR)

- Pages are rendered to HTML on the server using `hono/jsx`
- HTML is sent immediately to the browser
- User sees content instantly

### Client-Side Hydration

- Small JavaScript bundle loads asynchronously
- `hydrateRoot` "attaches" JavaScript logic to the server-rendered HTML
- Interactive features (like loading states) are enabled

## Files

### `form-handler.ts`

The main client-side component that adds form enhancements:

- Loading states on submit buttons
- Proper handling of browser back/forward cache (bfcache)
- Uses `addEventListener` to chain with existing handlers

### `index.tsx`

The client entry point that hydrates the component:

- Uses `hydrateRoot` from `hono/jsx/dom/client`
- Mounts the `FormHandler` component on the `client-root` div

### `client-bundle.ts`

Auto-generated file containing the bundled client JavaScript:

- Created by `build-client.js` during the build process
- Served inline (similar to CSS) for zero latency

## Build Process

The client-side code is built separately from the server code:

```bash
# Build client bundle
pnpm build:client

# This runs:
# 1. vite build --mode client  - Bundles the client code
# 2. node build-client.js      - Converts bundle to TypeScript module
```

## Development

### Adding New Client Features

1. Create your component in this directory
2. Import it in `index.tsx`
3. Add it to the hydration root

Example:

```tsx
// my-feature.ts
export function MyFeature() {
  useEffect(() => {
    // Your client-side logic here
  }, []);

  return null; // Or return JSX if needed
}

// index.tsx
import { MyFeature } from "./my-feature";

hydrateRoot(
  root,
  <StrictMode>
    <FormHandler />
    <MyFeature />
  </StrictMode>,
);
```

### Available Hooks

Hono's JSX/DOM supports React-compatible hooks:

- `useState`
- `useEffect`
- `useRef`
- `useCallback`
- `useMemo`
- And more...

See [Hono JSX/DOM documentation](https://hono.dev/docs/guides/jsx-dom) for full list.

## How It Works

1. **Server renders HTML** with a mounting point:

   ```tsx
   <div id="client-root"></div>
   <script type="module" src="/u/js/client.js" />
   ```

2. **Client script loads** and finds the mounting point

3. **`hydrateRoot` attaches** the component logic to existing HTML

4. **Interactive features activate** without re-rendering the page

## Bundle Size

The client bundle is optimized for size:

- Uses `hono/jsx/dom` runtime (much smaller than React)
- Only includes code that's actually used
- Typical size: ~2-3KB compressed

## References

- [Hono JSX/DOM Documentation](https://hono.dev/docs/guides/jsx-dom)
- [Dev.to Tutorial: Client-Side Logic in Hono](https://dev.to/fiberplane/step-by-step-guide-adding-client-side-logic-to-your-hono-app-14eh)
- [React hydrateRoot Documentation](https://react.dev/reference/react-dom/client/hydrateRoot)
