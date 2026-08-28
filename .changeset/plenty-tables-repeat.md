---
"authhero": patch
---

Replace the deprecated `@react-email/components` and `@react-email/render` packages with the unified `react-email` package for the bundled default email templates. The pre-rendered templates pick up react-email v6 markup (adds a `<title>` and `dir`/`lang` attributes, drops the logo preload link); visual output is unchanged.
