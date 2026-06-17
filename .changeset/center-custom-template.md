---
"authhero": patch
---

Fix the Universal Login (v2) widget not centering on narrow/mobile viewports
when a tenant uses a custom page template. The custom-template body was injected
into a bare wrapper `<div>`, which became a shrink-to-fit flex child of the
page `<body>`. That collapsed the widget container's `width: clamp(320px, 100%,
400px)` to its `320px` floor and pushed it off-centre on phones. The wrapper now
uses `display: contents`, so custom-template content participates directly in
the body's flex layout and centers exactly like the default template path.
