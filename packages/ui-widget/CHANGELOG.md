# @authhero/widget

## 0.33.0

### Minor Changes

- 3b77bf0: Animate the login widget resizing between steps.

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

## 0.32.42

### Patch Changes

- c76247b: Fix theme/branding options that were set but never applied. Several CSS variables produced by the theme were read under a different name (or not at all) by the component CSS, so the corresponding Auth0-style theme settings had no visible effect. Now wired up:

  - **Input Filled Text** (`input_filled_text`) — input/select text now uses this color instead of the body text color.
  - **Header** color (`header`) — title/header text color now applies.
  - **Secondary button** label and border colors (`secondary_button_label`, `secondary_button_border`).
  - **Widget border** color and weight (`widget_border`, `widget_border_weight`).
  - **Base focus color** (`base_focus_color`) — focus-ring outlines.
  - **Base hover color** (`base_hover_color`) — primary button hover now derives a darker shade by default and honors the configured hover color.
  - **Icons** color (`icons`).
  - **Input border weight** (`input_border_weight`) and phone field radius/background now follow the input settings.
  - **Font sizes/weights** for buttons, labels, links, body text, and subtitle.
  - **Custom font** (`font_url`) — the font stylesheet is now loaded so the `ulp-font` family resolves.

## 0.32.41

### Patch Changes

- Updated dependencies [aedf807]
  - @authhero/adapter-interfaces@3.1.1

## 0.32.40

### Patch Changes

- Updated dependencies [429f88a]
  - @authhero/adapter-interfaces@3.1.0

## 0.32.39

### Patch Changes

- Updated dependencies [3482bd3]
- Updated dependencies [8b8b117]
  - @authhero/adapter-interfaces@3.0.0

## 0.32.38

### Patch Changes

- Updated dependencies [d45a6b6]
  - @authhero/adapter-interfaces@2.13.1

## 0.32.37

### Patch Changes

- Updated dependencies [7a0606f]
  - @authhero/adapter-interfaces@2.13.0

## 0.32.36

### Patch Changes

- Updated dependencies [64e5f01]
  - @authhero/adapter-interfaces@2.12.0

## 0.32.35

### Patch Changes

- Updated dependencies [b195d31]
- Updated dependencies [9149210]
  - @authhero/adapter-interfaces@2.11.0

## 0.32.34

### Patch Changes

- e9c1c1e: Fix the "Try Connection" result screen rendering as "No screen configuration provided" after an OIDC/SAML connection test completes. The universal-login SSR was embedding the screen config as a JSON-stringified HTML attribute (`screen='…'`); HTML attribute parsing decodes character references, which broke any payload whose inner content had been HTML-escaped for an innerHTML context (`&quot;` → `"` mid-JSON). The try-connection-result screen was the first to embed an HTML-escaped JSON dump (the upstream userinfo), so it tripped the bug.

  The widget's SSR transport now ships screen/branding/theme/auth-params as `<script type="application/json">` children of the widget — script content is opaque to HTML entity decoding, so the JSON round-trips verbatim. The widget falls back through prop → script tag → legacy attribute.

  Also hide the per-tenant `authhero-try-connection-<tenantId>` stub client (created by `POST /api/v2/connections/:id/try`) from the management API's clients list, and reject `PATCH`/`DELETE` against it. Admins shouldn't see or be able to break the platform-managed row.

## 0.32.33

### Patch Changes

- Updated dependencies [3bef633]
  - @authhero/adapter-interfaces@2.10.0

## 0.32.32

### Patch Changes

- Updated dependencies [1fb1bd1]
  - @authhero/adapter-interfaces@2.9.1

## 0.32.31

### Patch Changes

- Updated dependencies [8b9ef23]
  - @authhero/adapter-interfaces@2.9.0

## 0.32.30

### Patch Changes

- Updated dependencies [1b7a39b]
- Updated dependencies [1b7a39b]
  - @authhero/adapter-interfaces@2.8.0

## 0.32.29

### Patch Changes

- Updated dependencies [28a6135]
  - @authhero/adapter-interfaces@2.7.0

## 0.32.28

### Patch Changes

- Updated dependencies [528e196]
  - @authhero/adapter-interfaces@2.6.1

## 0.32.27

### Patch Changes

- Updated dependencies [dcc6501]
  - @authhero/adapter-interfaces@2.6.0

## 0.32.26

### Patch Changes

- Updated dependencies [1bcf864]
  - @authhero/adapter-interfaces@2.5.0

## 0.32.25

### Patch Changes

- Updated dependencies [b6e628b]
  - @authhero/adapter-interfaces@2.4.0

## 0.32.24

### Patch Changes

- Updated dependencies [3b086bc]
  - @authhero/adapter-interfaces@2.3.0

## 0.32.23

### Patch Changes

- Updated dependencies [5e35511]
- Updated dependencies [5e35511]
  - @authhero/adapter-interfaces@2.2.0

## 0.32.22

### Patch Changes

- Updated dependencies [e9bef63]
- Updated dependencies [7c8668d]
  - @authhero/adapter-interfaces@2.1.0

## 0.32.21

### Patch Changes

- Updated dependencies [63bf3a9]
- Updated dependencies [63bf3a9]
- Updated dependencies [63bf3a9]
  - @authhero/adapter-interfaces@2.0.0

## 0.32.20

### Patch Changes

- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
  - @authhero/adapter-interfaces@1.19.0

## 0.32.19

### Patch Changes

- 47afa9e: Honor `theme.colors.primary_button_label` unconditionally instead of dropping it when its WCAG contrast against `primary_button` falls below 4.5. Previously, a tenant setting (e.g.) white text on a medium blue button was silently overridden by an auto-picked black, because the contrast ratio sat just under the AA threshold. The tenant's explicit choice now wins; the auto-picker only runs when no label is set.

## 0.32.18

### Patch Changes

- Updated dependencies [2ea1664]
- Updated dependencies [2ea1664]
  - @authhero/adapter-interfaces@1.18.0

## 0.32.17

### Patch Changes

- Updated dependencies [0c662c0]
  - @authhero/adapter-interfaces@1.17.0

## 0.32.16

### Patch Changes

- Updated dependencies [7dd280c]
- Updated dependencies [7dd280c]
- Updated dependencies [7dd280c]
- Updated dependencies [45f719e]
  - @authhero/adapter-interfaces@1.16.0

## 0.32.15

### Patch Changes

- Updated dependencies [639ab29]
  - @authhero/adapter-interfaces@1.15.0

## 0.32.14

### Patch Changes

- Updated dependencies [85d1d06]
  - @authhero/adapter-interfaces@1.14.0

## 0.32.13

### Patch Changes

- Updated dependencies [e0cd449]
- Updated dependencies [86fe6e8]
- Updated dependencies [f41b85c]
- Updated dependencies [3891832]
  - @authhero/adapter-interfaces@1.13.0

## 0.32.12

### Patch Changes

- Updated dependencies [32aacc6]
- Updated dependencies [a4e29bd]
- Updated dependencies [32aacc6]
- Updated dependencies [6e5762c]
- Updated dependencies [32aacc6]
  - @authhero/adapter-interfaces@1.12.0

## 0.32.11

### Patch Changes

- Updated dependencies [21b0608]
- Updated dependencies [ea5ec43]
- Updated dependencies [90e9906]
  - @authhero/adapter-interfaces@1.11.0

## 0.32.10

### Patch Changes

- Updated dependencies [e5cbfe7]
- Updated dependencies [dd071e0]
  - @authhero/adapter-interfaces@1.10.3

## 0.32.9

### Patch Changes

- Updated dependencies [3230b9b]
  - @authhero/adapter-interfaces@1.10.2

## 0.32.8

### Patch Changes

- Updated dependencies [4d06f0d]
  - @authhero/adapter-interfaces@1.10.1

## 0.32.7

### Patch Changes

- Updated dependencies [ba03e14]
  - @authhero/adapter-interfaces@1.10.0

## 0.32.6

### Patch Changes

- Updated dependencies [2578652]
  - @authhero/adapter-interfaces@1.9.0

## 0.32.5

### Patch Changes

- Updated dependencies [48eab09]
- Updated dependencies [02cebf4]
  - @authhero/adapter-interfaces@1.8.0

## 0.32.4

### Patch Changes

- Updated dependencies [9145dbd]
- Updated dependencies [9145dbd]
  - @authhero/adapter-interfaces@1.7.0

## 0.32.3

### Patch Changes

- Updated dependencies [7d9f138]
  - @authhero/adapter-interfaces@1.6.0

## 0.32.2

### Patch Changes

- Updated dependencies [931f598]
  - @authhero/adapter-interfaces@1.5.0

## 0.32.1

### Patch Changes

- Updated dependencies [1d15292]
  - @authhero/adapter-interfaces@1.4.1

## 0.32.0

### Minor Changes

- d288b62: Add support for dynamic workers

## 0.31.4

### Patch Changes

- Updated dependencies [d84cb2f]
  - @authhero/adapter-interfaces@1.4.0

## 0.31.3

### Patch Changes

- Updated dependencies [2f6354d]
  - @authhero/adapter-interfaces@1.3.0

## 0.31.2

### Patch Changes

- Updated dependencies [b2aff48]
  - @authhero/adapter-interfaces@1.2.0

## 0.31.1

### Patch Changes

- Updated dependencies [3da602c]
  - @authhero/adapter-interfaces@1.1.0

## 0.31.0

### Minor Changes

- 20d5140: Add support for dynamic code

  BREAKING CHANGE: `DataAdapters` now requires a `hookCode: HookCodeAdapter` property. Adapters implementing `DataAdapters` must provide a `hookCode` adapter with `create`, `get`, `update`, and `remove` methods for managing hook code storage. See `packages/kysely/src/hook-code/` for a reference implementation.

### Patch Changes

- Updated dependencies [20d5140]
  - @authhero/adapter-interfaces@1.0.0

## 0.30.0

### Minor Changes

- 4176937: Handle outbox messages and update universal auth

### Patch Changes

- Updated dependencies [a59a49b]
  - @authhero/adapter-interfaces@0.155.0

## 0.29.2

### Patch Changes

- Updated dependencies [fa7ce07]
  - @authhero/adapter-interfaces@0.154.0

## 0.29.1

### Patch Changes

- Updated dependencies [884e950]
  - @authhero/adapter-interfaces@0.153.0

## 0.29.0

### Minor Changes

- 885eeeb: Fix passkeys

## 0.28.2

### Patch Changes

- Updated dependencies [f3b910c]
  - @authhero/adapter-interfaces@0.152.0

## 0.28.1

### Patch Changes

- Updated dependencies [3e74dea]
- Updated dependencies [022f12f]
  - @authhero/adapter-interfaces@0.151.0

## 0.28.0

### Minor Changes

- 164fe2c: Added passkeys

### Patch Changes

- Updated dependencies [164fe2c]
  - @authhero/adapter-interfaces@0.150.0

## 0.27.0

### Minor Changes

- 7c52f88: Fix setup guide bugs

## 0.26.0

### Minor Changes

- c862e9f: Add footer to u2 routes and fix docker build

## 0.25.0

### Minor Changes

- f4557c1: Fix the topt enrollment

## 0.24.0

### Minor Changes

- d9c2ad1: Fixes to mfa-signup and new account screens

## 0.23.0

### Minor Changes

- 64e858a: Add mfa with logging

### Patch Changes

- Updated dependencies [64e858a]
  - @authhero/adapter-interfaces@0.149.0

## 0.22.0

### Minor Changes

- 469c395: Language refactor

### Patch Changes

- Updated dependencies [469c395]
  - @authhero/adapter-interfaces@0.148.0

## 0.21.0

### Minor Changes

- 5e73f56: Remove magic strings
- 5e73f56: Replace magic strings
- 5e73f56: Handle text colors better

### Patch Changes

- Updated dependencies [5e73f56]
- Updated dependencies [5e73f56]
  - @authhero/adapter-interfaces@0.147.0

## 0.20.0

### Minor Changes

- 409aa18: Improve phone fields
- 318fcf9: Update widget links
- 318fcf9: Update widget links

### Patch Changes

- Updated dependencies [318fcf9]
- Updated dependencies [318fcf9]
  - @authhero/adapter-interfaces@0.146.0

## 0.19.2

### Patch Changes

- Updated dependencies [30b5be1]
  - @authhero/adapter-interfaces@0.145.0

## 0.19.1

### Patch Changes

- Updated dependencies [dcbd1d7]
  - @authhero/adapter-interfaces@0.144.0

## 0.19.0

### Minor Changes

- 39df1aa: Change url of enter-code page

### Patch Changes

- Updated dependencies [39df1aa]
  - @authhero/adapter-interfaces@0.143.0

## 0.18.0

### Minor Changes

- 1a72b93: Added error pages and fixed provider user id

### Patch Changes

- Updated dependencies [1a72b93]
  - @authhero/adapter-interfaces@0.142.0

## 0.17.2

### Patch Changes

- Updated dependencies [3de697d]
  - @authhero/adapter-interfaces@0.141.0

## 0.17.1

### Patch Changes

- Updated dependencies [7154fe1]
  - @authhero/adapter-interfaces@0.140.0

## 0.17.0

### Minor Changes

- e849524: Update the data-screen on client side navigatin

## 0.16.0

### Minor Changes

- 2617efb: Update stylig for widget

### Patch Changes

- Updated dependencies [2617efb]
  - @authhero/adapter-interfaces@0.139.0

## 0.15.3

### Patch Changes

- Updated dependencies [192f480]
  - @authhero/adapter-interfaces@0.138.0

## 0.15.2

### Patch Changes

- Updated dependencies [0719de4]
  - @authhero/adapter-interfaces@0.137.0

## 0.15.1

### Patch Changes

- Updated dependencies [d7bcd19]
  - @authhero/adapter-interfaces@0.136.0

## 0.15.0

### Minor Changes

- 65321b7: Update for forms, flows and u2 login

### Patch Changes

- Updated dependencies [65321b7]
  - @authhero/adapter-interfaces@0.135.0

## 0.14.0

### Minor Changes

- 00e9cf7: Add support for forms in the u2 login

## 0.13.3

### Patch Changes

- Updated dependencies [a5c1ba9]
  - @authhero/adapter-interfaces@0.134.0

## 0.13.2

### Patch Changes

- Updated dependencies [7adc7dc]
  - @authhero/adapter-interfaces@0.133.0

## 0.13.1

### Patch Changes

- Updated dependencies [131ea43]
  - @authhero/adapter-interfaces@0.132.0

## 0.13.0

### Minor Changes

- c5935bd: Update the new widget endpoints

### Patch Changes

- Updated dependencies [c5935bd]
  - @authhero/adapter-interfaces@0.131.0

## 0.12.0

### Minor Changes

- 0a5816a: Update the parts for styling of social buttons

## 0.11.0

### Minor Changes

- bf22ac7: Add support for inlang

## 0.10.0

### Minor Changes

- 44b76d9: Update the custom text behaviour

## 0.9.0

### Minor Changes

- 88a03cd: Add ssr for widget
- ac8af37: Add custom text support

### Patch Changes

- Updated dependencies [ac8af37]
  - @authhero/adapter-interfaces@0.130.0

## 0.8.6

### Patch Changes

- Updated dependencies [a8e70e6]
  - @authhero/adapter-interfaces@0.129.0

## 0.8.5

### Patch Changes

- Updated dependencies [6585906]
  - @authhero/adapter-interfaces@0.128.0

## 0.8.4

### Patch Changes

- Updated dependencies [fd374a9]
- Updated dependencies [8150432]
  - @authhero/adapter-interfaces@0.127.0

## 0.8.3

### Patch Changes

- Updated dependencies [154993d]
  - @authhero/adapter-interfaces@0.126.0

## 0.8.2

### Patch Changes

- Updated dependencies [491842a]
  - @authhero/adapter-interfaces@0.125.0

## 0.8.1

### Patch Changes

- Updated dependencies [2af900c]
- Updated dependencies [2be02f8]
  - @authhero/adapter-interfaces@0.124.0

## 0.8.0

### Minor Changes

- d979690: Update the widget embed functionality

## 0.7.2

### Patch Changes

- Updated dependencies [2d0a7f4]
  - @authhero/adapter-interfaces@0.123.0

## 0.7.1

### Patch Changes

- Updated dependencies [9d6cfb8]
  - @authhero/adapter-interfaces@0.122.0

## 0.7.0

### Minor Changes

- a98dbc4: Widget styling updated

### Patch Changes

- Updated dependencies [2853db0]
- Updated dependencies [967d470]
  - @authhero/adapter-interfaces@0.121.0

## 0.6.3

### Patch Changes

- Updated dependencies [00d2f83]
  - @authhero/adapter-interfaces@0.120.0

## 0.6.2

### Patch Changes

- Updated dependencies [8ab8c0b]
  - @authhero/adapter-interfaces@0.119.0

## 0.6.1

### Patch Changes

- Updated dependencies [b7bb663]
  - @authhero/adapter-interfaces@0.118.0

## 0.6.0

### Minor Changes

- 8611a98: Improve the multi-tenancy setup

### Patch Changes

- Updated dependencies [8611a98]
  - @authhero/adapter-interfaces@0.117.0

## 0.5.0

### Minor Changes

- f4b74e7: Add widget to react-admin
- b6d3411: Add a hono demo for the widget

## 0.4.1

### Patch Changes

- Updated dependencies [9c15354]
  - @authhero/adapter-interfaces@0.116.0

## 0.4.0

### Minor Changes

- 8e9a085: Add prepublish to ci script

## 0.3.0

### Minor Changes

- 23c06fc: Add a prepublish to widget

## 0.2.2

### Patch Changes

- Updated dependencies [f738edf]
  - @authhero/adapter-interfaces@0.115.0

## 0.2.1

### Patch Changes

- Updated dependencies [17d73eb]
- Updated dependencies [e542773]
  - @authhero/adapter-interfaces@0.114.0

## 0.2.0

### Minor Changes

- d967833: Add a stencil-js widget for login

### Patch Changes

- Updated dependencies [d967833]
  - @authhero/adapter-interfaces@0.113.0
