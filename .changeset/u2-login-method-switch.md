---
"authhero": patch
"@authhero/widget": patch
"@authhero/adapter-interfaces": patch
---

Let users switch between password and email code on the u2 login challenge screens, like the classic login. In the identifier-first flow, the enter-password screen now shows an "or" divider with a "Log in with a code" button that emails a code, and the email-otp-challenge screen offers "Log in with password" when the user has a password. `NEXT_BUTTON` gains optional `variant: "secondary"` and `skip_validation` config, and the widget renders dividers inline on screens without social buttons.
