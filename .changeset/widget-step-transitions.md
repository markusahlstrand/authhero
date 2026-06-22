---
"@authhero/widget": minor
"authhero": minor
---

Animate the login widget resizing between steps.

When the widget advances to the next screen (e.g. identifier → password →
code), the widget card now animates its height from the current step's size to
the next one's — like Stripe's dashboard login — instead of snapping. The
content swaps without a fade; the card just resizes.

- `@authhero/widget`: after a form submit swaps the screen, `swapScreen` locks
  the card's current height, swaps the content, measures the new screen's
  natural height, and animates the `.widget-container` height between them via
  the Web Animations API (520ms). The card (not the host) is animated so the
  background resize is visible and the drop-shadow stays intact. Falls back to
  an instant swap when the Web Animations API is unavailable or the user has
  `prefers-reduced-motion: reduce`. This runs in auto-submit mode (the default
  for the authhero universal-login page); host apps that drive the widget in
  controlled mode (setting the `screen` prop themselves) can animate the swap
  the same way on their side.
- `authhero`: the universal-login page additionally opts same-origin full-page
  navigations (back/forward, "try another way" links, language switch) into
  cross-document view transitions, with a `prefers-reduced-motion` guard.
