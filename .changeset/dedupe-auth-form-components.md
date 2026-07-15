---
"authhero": patch
---

Deduplicate the universal-login auth forms (#1102). The sign-up, reset-password,
enter-password, forgot-password, and identifier screens each carried verbatim
copies of the same ~68-line theme/branding style computation, and the sign-up,
reset-password, and enter-password screens repeated the same ~66-line
password-input-with-visibility-toggle block up to twice each.

These are now shared:
- `getThemeStyles(theme, branding, error)` — the derived colors, border/font
  sizes, and card/title/body/input/button style objects.
- `AuthCard` — the themed card shell (logo, title, description) with the form
  passed as children.
- `PasswordField` — the themed password input plus its show/hide toggle
  markup and client-hydration data attributes.

Pure refactor with no behavior change; a render-snapshot test asserts the
affected screens produce byte-identical HTML.
