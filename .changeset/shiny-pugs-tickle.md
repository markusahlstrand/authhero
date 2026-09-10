---
"authhero": patch
"@authhero/widget": patch
---

Fix the u2 login page on phones, and give it a real footer.

**Background image was dropped on mobile.** Below 480px the page
unconditionally replaced the body background with the widget's own colour, so
a tenant's `theme.page_background.background_image_url` never rendered on the
device most sign-ins come from. The phone layout now has two variants:

- **With a background image** — the card floats on the image, keeping its
  radius and shadow. The widget is marked `floating` so its own stylesheet
  doesn't paint over the image with 100vh of widget colour.
- **Without one** — unchanged: the card fills the screen edge-to-edge.

**A stray line split the phone screen.** The full-bleed variant stripped the
card's `box-shadow` and `border-radius` but not its `border`, so a themed
`--ah-widget-border-width` drew the card's bottom edge straight across the
viewport, leaving the fill below it looking cut off. The border is now
dropped along with the rest of the card chrome.

**Corner chips are replaced by a footer bar on phones.** They used to be
hidden outright below 480px — terms and the trust mark simply vanished, and
the settings chip sat on top of the card. They now collapse into a footer
pinned to the bottom of the viewport carrying the terms link, the trust mark,
the dark-mode toggle and the language picker, with a surface that adapts to
light/dark and to whether there's a background image behind it.

**Page chrome moved to `@authhero/widget/page-chrome`.** The CSS and chrome
markup were defined in authhero and hand-mirrored in the widget's demo server,
which drifted. Both now render from one framework-free module — strings in,
strings out, no JSX runtime and no i18n stack (authhero resolves labels and
passes them in). The chip renderers return HTML strings rather than JSX nodes;
the Liquid `{%- authhero:* -%}` slots already called `.toString()` on them, so
that contract is unchanged, and a new `authhero:footer` slot is available.
