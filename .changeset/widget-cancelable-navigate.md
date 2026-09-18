---
"@authhero/widget": minor
---

The `navigate` event is now cancelable. Calling `preventDefault()` on it stops the widget's own `window.location` navigation for social-login redirects and post-submit redirects, so a host page can take over (for example open the provider in a popup).
