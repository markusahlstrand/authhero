---
"@authhero/adapter-interfaces": minor
"@authhero/widget": minor
---

Add a dedicated `CODE` field component for one-time / verification codes. It renders a segmented input (Auth0-style boxes) using a single underlying `<input autocomplete="one-time-code">`, preserving native paste, mobile SMS autofill and screen-reader behaviour. Supports `length`, `mode` (`numeric` | `alphanumeric`) and `auto_submit` config.
