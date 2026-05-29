---
"authhero": patch
---

Add a `/u2/info` landing route that renders a branded info screen instead of a 400 error. It's intended as a `redirect_uri` target (e.g. the admin "Login" link) and renders from tenant branding since the `state` it receives is the client's OAuth state rather than a login session. When the redirect carries an OAuth error it renders a branded error page instead.
