---
title: Embedded Login (iframe)
description: Show the hosted login in a modal on your own site by framing the /u2 pages, without giving up the security of the redirect flow.
---

# Embedded Login (iframe)

By default an application sends the user to the hosted login pages with a full
redirect. Embedded login keeps the user on your page: the same `/u2` screens
render inside an `<iframe>` that you place in a modal, resize to the current
screen, and close when the authorization response arrives.

Credentials never touch your page. The login form runs on the auth origin
inside the frame, so scripts on your site cannot read what the user types.
That is the difference to mounting the widget directly in your DOM, and the
reason to prefer this mode on pages that load third-party scripts.

## How it works

1. Your page starts an ordinary OAuth authorization request with
   `response_mode=web_message` and loads it in an iframe.
2. AuthHero recognises the web_message session and renders the screens in a
   compact layout: no page chrome, transparent background, the widget card
   at its own height. It posts `authhero:resize` messages as that height
   changes.
3. Every screen of the flow, including MFA and profile-completion forms,
   navigates inside the frame.
4. When the user is signed in, the frame posts an `authorization_response`
   message with the authorization code to your page. Your page exchanges the
   code at `/oauth/token` with PKCE, exactly as after a redirect.

The pages are only frameable by the origins listed in the application's
**Allowed Web Origins** (`web_origins`). Every other universal-login response
carries `Content-Security-Policy: frame-ancestors 'none'`.

## Prerequisites

- **A custom domain for the auth server on your site**, for example
  `login.example.com` when your site is `www.example.com`. Then the session
  cookie is first-party and unaffected by third-party cookie blocking. Without
  it the login still works, but the cookie is partitioned to your site, so
  there is no single sign-on with other sites using the same tenant.
- The application's `web_origins` contains your page's origin, and its
  `callbacks` contains the `redirect_uri` you will use. The `redirect_uri`
  must be on the origin that owns the iframe: that origin is where the
  messages are posted.
- The application uses the widget-based login
  (`client_metadata.universal_login_version = "2"`).
- The application is a public client using PKCE. The authorization code is
  delivered to browser JavaScript, so there is no client secret.

## Integration

### 1. Start the flow

Build the `/authorize` URL as usual, with `response_mode=web_message`:

```
https://login.example.com/authorize
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=https%3A%2F%2Fwww.example.com%2Fcallback
  &response_type=code
  &response_mode=web_message
  &scope=openid%20profile%20email
  &state=RANDOM_STATE
  &nonce=RANDOM_NONCE
  &code_challenge=PKCE_CHALLENGE
  &code_challenge_method=S256
```

### 2. Frame it

```html
<div id="login-modal" hidden>
  <iframe
    id="login-frame"
    title="Sign in"
    allow="publickey-credentials-get; publickey-credentials-create"
    style="width: 100%; border: 0; background: transparent"
  ></iframe>
</div>
```

The `allow` attribute is what lets passkeys work inside a cross-origin frame.
The frame's height is driven by the resize messages, so leave it unset.

### 3. Listen for messages

Both message types come from the frame's window on the auth origin. Check
`event.origin` and `event.source` before acting on either.

```javascript
const authOrigin = "https://login.example.com";
const frame = document.getElementById("login-frame");

window.addEventListener("message", async (event) => {
  if (event.origin !== authOrigin) return;
  if (event.source !== frame.contentWindow) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "authhero:resize") {
    frame.style.height = `${data.height}px`;
    return;
  }

  if (data.type === "authorization_response") {
    const response = data.response;
    closeModal();
    if (response.error) {
      showError(response.error_description || response.error);
      return;
    }
    if (response.state !== expectedState) {
      showError("State mismatch");
      return;
    }
    const tokens = await exchangeCode(response.code);
    // ...
  }
});
```

`response` carries the same fields the redirect would have carried: `code`
and `state` on success, `error` and `error_description` on failure. If the
login session expires or a page fails while embedded, the error page inside
the frame posts an `authorization_response` with an error too, so your modal
can react instead of showing a dead frame.

### 4. Exchange the code

```javascript
async function exchangeCode(code) {
  const res = await fetch(`${authOrigin}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: "YOUR_CLIENT_ID",
      code,
      code_verifier: pkceVerifier,
      redirect_uri: "https://www.example.com/callback",
    }),
  });
  return res.json();
}
```

### With auth0-spa-js

The Auth0 SPA SDK's popup flow already speaks this protocol: `loginWithPopup`
requests `response_mode=web_message` and resolves when an
`authorization_response` message arrives. Hand it the iframe's window in
place of a popup and it drives the frame, verifies `state`, and exchanges the
code for you:

```javascript
const frame = document.getElementById("login-frame");
openModal();
try {
  await auth0.loginWithPopup(
    {},
    { popup: frame.contentWindow, closePopup: false },
  );
} finally {
  closeModal();
}
```

Keep your own `message` listener for `authhero:resize`. If the user closes
the modal, remove the iframe from the DOM: the SDK polls the window's
`closed` flag and rejects with its popup-cancelled error. Verified against
auth0-spa-js 2.17, which matches messages by their `type` field only.

## Social, enterprise and passkey logins

Google, Microsoft and most other identity providers refuse to render inside a
frame. When the user picks such a connection, the embedded page opens the
provider in a popup window instead of navigating the frame. The popup
completes on the auth origin and hands the authorization response back to the
frame, which relays it to your page. Your listener sees it as any other
completion, from the frame's window.

The popup opens from the user's click, so it is not affected by popup
blockers under normal conditions.

Passkeys work in the frame as long as the `allow` attribute above is present.
The relying-party ID is the auth domain, so a custom domain on your site is
what makes passkeys enrolled on the hosted pages usable here.

## Layout notes

- The frame's document has a transparent background and no padding. The
  widget renders as a floating card with the tenant's corner radius and
  shadow, so your modal can be the card itself, or wrap it.
- On phones, show the frame as a full-screen sheet and ignore the resize
  messages, or keep the modal and let the height follow.
- The tenant's Liquid page template is not applied to embedded pages: it lays
  out a whole page. Branding, theme and custom text apply as usual.
- `response_mode=form_post` cannot be embedded. Use `web_message`.

## Security

- **Framing** is allowed only from the application's `web_origins`. Every
  other universal-login response sends `frame-ancestors 'none'` and
  `X-Frame-Options: DENY`.
- **Messages** are posted only to the origin of the login session's
  `redirect_uri`, which must be a registered callback. The frame accepts relay
  messages only from its own origin.
- **The authorization code** reaches your JavaScript, as it does after a
  redirect for a public client. PKCE binds it to your page, and you must
  compare `state`.
- **Cookies** set during the embedded login are the same session cookies as
  on the hosted pages. Under a custom domain on your site they are
  first-party; otherwise they are partitioned to your site by the browser.
- **Rate limits** and bot protection on the login endpoints apply unchanged.

For the alternative of mounting the `<authhero-widget>` component directly in
your page, see [Integration Patterns](/customization/ui-widget/integration-patterns).
That mode gives full styling control but exposes the login form to every
script on your page.
