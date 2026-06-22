---
"authhero": minor
---

Render the Universal Login page template with Liquid and add a full-page preview.

The custom universal-login template body is now rendered with Liquid (the same
engine used for email templates) instead of plain string replacement. Stored
templates keep working unchanged — the existing `{%- auth0:widget -%}` /
`{%- authhero:* -%}` slot tokens are now real Liquid tags — but templates can
additionally use variables and control flow.

- The `auth0` / `authhero` slot tags are registered as native Liquid tags, so
  slots can live inside `{% if %}` blocks and templates can reference
  `{{ branding.logo_url }}`, `{{ branding.colors.primary }}`,
  `{{ prompt.screen.name }}`, `{{ client.name }}` and `{{ locale }}`.
- New in-flow regions above and below the widget: wrap the widget in
  `<div class="ah-widget-stack">` and add `.ah-above-widget` / `.ah-below-widget`
  divs to place custom content directly above/below the card (empty regions
  collapse). The default template now demonstrates this layout.
- Corner chips take an optional `style` argument
  (`{%- authhero:legal style="plain" -%}`, `"pill"`, or `"auto"`) so the
  pill-vs-plain decision can be made in the template instead of being driven
  only by whether a background image is present. The default stays `auto`
  (pill over an image, plain text on a solid background). Templates can also
  branch on new `page` variables: `page.has_background_image`, `page.dark_mode`,
  `page.logo_position`, `page.layout`.
- `PUT /api/v2/branding/templates/universal-login` now validates that the body
  is syntactically valid Liquid (in addition to requiring the widget tag), and
  accepts the widget tag in any valid spelling (e.g. `{% auth0:widget %}`).
- A malformed template can no longer take the login page down: rendering falls
  back to the default template, then to the bare widget.
- Auth0-compatibility escape hatch: a template containing `<html>` is rendered
  as a full document (rather than wrapped in the fixed shell), and the
  `{%- auth0:head -%}` tag injects the head essentials (page CSS, fonts, widget
  script, dark-mode runtime). This lets an Auth0 page template be pasted in and
  work; body-fragment templates are unchanged.
- New `POST /api/v2/branding/templates/universal-login/preview` endpoint renders
  a full-page Universal Login preview with the tenant's branding/theme and a
  sample screen (`login` | `identifier` | `password` | `signup`). It accepts
  optional `body`, `branding` and `theme` overrides so an editor can preview
  unsaved changes.

**Behavior change for existing custom templates.** Stored templates that use
the documented slot tokens plus plain HTML render exactly as before. Two narrow
cases differ now that bodies pass through Liquid:

- A template containing literal `{{ … }}` or `{% … %}` sequences that were _not_
  intended as Liquid (e.g. an inline script, a JSON blob, or framework-style
  braces) is now interpreted by Liquid. The output can change, and if the
  sequence is invalid Liquid the page falls back to the default template (no
  outage). Previously these sequences were left untouched.
- Unknown/typo'd slot tokens (e.g. `{%- authhero:legl -%}`) now render empty
  instead of being left in the output as literal text.

`PUT` validation is also stricter: a body that isn't valid Liquid is now
rejected. If you have a custom template, re-save it through the admin UI to
confirm it still validates and renders as expected.
