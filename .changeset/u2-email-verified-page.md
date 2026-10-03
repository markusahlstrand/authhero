---
"authhero": minor
---

Render a branded, translated "Email verified" page for `/u2/tickets/email-verification` instead of bare HTML. The page shows a Continue button that leads back to the app: the client's `initiate_login_uri` when it is HTTPS, or else the origin of the `redirect_uri` the user signed up from. Verification emails sent from login and signup flows now store the client, redirect URI and language on the ticket. Clicking an already used link for a verified user shows the verified page again instead of an error, which covers mail scanners that prefetch links. Tickets created with a `result_url` still show an already-used error on a second click. Invalid or expired links render a branded, translated error page.
