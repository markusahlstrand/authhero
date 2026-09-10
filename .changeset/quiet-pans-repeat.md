---
"@authhero/widget": patch
"authhero": patch
---

Emit the u2 page layout from one place, so the phone breakpoints no longer need `!important`.

The same layout was expressed two ways. The full-document (Auth0-style) template path put the body layout in the stylesheet; the body-fragment path applied it inline on `<body>`. The widget container's responsive width was inline on both. An inline declaration outranks a normal rule from a stylesheet, so every rule in the mobile block had to shout to be heard — and the demo server, which hand-mirrored both, had its own copies sitting *after* the shared stylesheet, where only those `!important` flags kept them from winning.

Both paths now emit the body layout through `buildPageCss`, and the container's `width: clamp(320px, 100%, 400px)` — identical for every tenant on every request — moves into the `.widget-container` rule. The inline style keeps only the per-tenant CSS variables, which is what inline is for. The phone rules then override by plain cascade: same specificity, later in the sheet.

Six `!important` flags go, along with the demo's duplicated body and container rules and the `bodyStyle` field on `/u2/preview/chrome`. No visual change — the rendered layout is identical at every width, in both phone variants, and whether or not a custom template wraps the widget in its own element.

The remaining `!important` flags are the dark-mode CSS-variable overrides, which genuinely have to outrank the container's inline variables, and the reduced-motion animation reset.
