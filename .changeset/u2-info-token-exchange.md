---
"authhero": patch
---

The `/u2/info` test redirect page now exchanges the authorization code server-side and shows the result: buttons that copy the ID, access and refresh tokens to the clipboard, and a grid with the ID token claims. Codes issued for any other redirect_uri are refused so the page can't be used to redeem intercepted codes.
