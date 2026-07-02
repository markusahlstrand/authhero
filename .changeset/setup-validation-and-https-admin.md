---
"authhero": patch
"create-authhero": patch
---

The /setup screen now shows an error message when the password is too short (or the identifier is empty) instead of failing with a bare 400 the widget can't display. The local template's generated app.ts defaults the admin UI config to the https issuer so the admin UI no longer links to http://localhost:3000, and the seed script includes the https://localhost:3000 callback and logout URLs.
