---
"authhero": patch
---

Fix the universal login widget rendering off-centre on narrow viewports. A theme
with `page_background.page_layout` of `left`/`right` kept its 80px offset all the
way down to 561px, and the mobile full-bleed rule for the widget container was
being outranked by the container's inline width, leaving a 400px card with
stray gutters (and no radius or shadow) on 400–480px phones. Offset layouts now
collapse to centred under 768px, and the container really does go edge to edge
under 480px.
