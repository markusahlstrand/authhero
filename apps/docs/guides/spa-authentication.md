# SPA Authentication: A Complete Guide (2026)

> **Note:** This guide applies to all OAuth 2.0/OIDC-compliant authentication servers, not just AuthHero. The architectural decisions and trade-offs discussed here are universal concerns for modern single-page applications.

## Introduction

Authentication in Single-Page Applications has become increasingly complex due to privacy initiatives from browser vendors. In 2026, there's no single "best practice"—instead, you must choose between competing priorities: security, user experience, and cross-domain functionality.

This guide will help you understand the fundamental trade-offs and choose the right architecture for your application.

## Part 1: Choosing Your Architecture (The Privacy vs. SSO Trade-off)

The "best" way to implement authentication depends on a single critical question: **Does your session need to live on one domain, or across many?**

### 1. The BFF (Backend-for-Frontend)

**The gold standard for security.** A server-side proxy handles the login and stores tokens in a secure, server-side session. The SPA only sees a first-party, `Secure`, `HttpOnly` cookie.

#### The Cross-Domain Downside

Cookies are domain-bound. If you have a BFF on `app.com`, it cannot share that session with `partner-site.org`. You are trading cross-domain SSO for maximum security.

#### Pros

- Immune to token theft via XSS attacks
- No third-party cookie issues
- Tokens never exposed to JavaScript
- Works perfectly with modern browser privacy features

#### Cons

- Implementation complexity
- Requires a server component
- **Kills cross-domain SSO completely**
- Requires careful CORS configuration

#### When to Use

- High-security applications (banking, healthcare, etc.)
- Single-domain applications
- When you already have a backend infrastructure
- When XSS risk is unacceptable

---

### 2. Refresh Tokens (The Modern SPA Standard)

The SPA receives an **Access Token** and a **Refresh Token**. The access token is short-lived (minutes to hours), while the refresh token can last days or weeks.

#### The Auth0-SPA-JS Advantage

If you use libraries like `auth0-spa-js` or similar OIDC client libraries, this flow is incredibly easy to enable:

```javascript
const auth0 = new Auth0Client({
  domain: "your-auth-server.com",
  clientId: "your-client-id",
  useRefreshTokens: true,
  cacheLocation: "localstorage", // or 'memory'
});
```

The library automatically handles the "background refresh" using the Refresh Token via a direct POST request to the token endpoint, **bypassing the need for iframes entirely**.

#### The Cross-Domain Downside

Like the BFF, `localStorage` is scoped to a single origin. A Refresh Token on `site-a.com` is invisible to `site-b.com`.

#### Pros

- No iframes required
- Works even when third-party cookies are blocked
- Perfect for mobile browsers and privacy-focused browsers
- Native mobile app equivalent flow
- Relatively simple to implement with modern libraries

#### Cons

- **XSS Vulnerability:** If a script can read your `localStorage`, it can steal your Refresh Token
- Requires **Refresh Token Rotation** for security (each use issues a new token and invalidates the old one)
- No cross-domain SSO
- Token storage decisions (localStorage vs. memory) affect user experience

#### When to Use

- Modern single-domain SPAs
- Mobile-responsive applications
- When third-party cookie support is uncertain
- When you can implement proper XSS protection

#### Critical Security Requirement: Refresh Token Rotation

Always enable Refresh Token Rotation. This ensures that:

1. Each refresh operation issues a new refresh token
2. The old refresh token is immediately invalidated
3. Concurrent refresh attempts trigger security alerts
4. Token theft has a limited window of exploitation

---

### 3. Silent Auth (The "Classic" Iframe)

The SPA opens a hidden iframe pointing to the auth server. Since the user has a session cookie on the auth domain (e.g., `login.provider.com`), the server recognizes them and passes a new token back to the app.

#### The Cross-Domain Superpower

This is the **only way to achieve true "logged in one, logged in all" SSO**. Because the session lives on the Auth Domain (not your app's domain), every app that points an iframe to that domain can "see" the session.

#### The 2026 Reality: Browser Privacy Impacts Silent Auth

This method is affected by browser privacy initiatives, though the landscape has evolved:

- **Chrome**: Still supports third-party cookies (Google abandoned full deprecation in July 2024, shifting to a user-choice model reaffirmed in October 2025). CHIPS (Partitioned Cookies) provides a reliable solution for iframe-based auth.
- **Safari ITP**: Kills iframe-based auth after 30 days of inactivity on the auth domain. Safari 18.4 briefly added CHIPS support, but WebKit subsequently disabled it due to incomplete handling.
- **Firefox Enhanced Tracking Protection**: Blocks known authentication domains
- **Brave**: Aggressive blocking by default
- **Android (Chrome/WebView)**: Third-party cookies still work, but standard cookies are frequently wiped during browser or system updates—causing unexpected logouts. CHIPS cookies survive these updates, making them essential for reliable session persistence on Android.

#### Pros

- True cross-domain SSO
- Seamless token renewal without user interaction
- No navigation disruption

#### Cons

- Browser support varies significantly
- CHIPS works well on Chrome/Android but Safari actively disabled it after initial 18.4 support
- Safari's 30-day timer requires regular user interaction with the auth domain
- May silently fail, requiring fallback mechanisms

> **Practical Solution:** Use CHIPS for Chrome/Android devices combined with `prompt=none` redirect fallback for Safari/iOS. This combination provides reliable cross-subdomain authentication across all platforms.

#### When to Use (if at all)

- Enterprise environments with managed browsers
- Temporary solution while migrating to Refresh Tokens
- As a **fallback** with proper error handling
- When you control both the auth domain and can ensure user interaction

---

## Part 2: The Battle of UX — Popups vs. Redirects

Once you've picked your architecture, you need to decide **how the user actually logs in**. This is where most developers get "browser-shamed."

### The Redirect Flow (`loginWithRedirect`)

The user is sent away from your app to the login page and returns after authentication.

```javascript
// Example with auth0-spa-js
await auth0.loginWithRedirect({
  appState: {
    targetUrl: window.location.pathname,
  },
});

// After redirect back
const { appState } = await auth0.handleRedirectCallback();
window.location.href = appState?.targetUrl || "/";
```

#### Best For

- **Subdomains** (e.g., `app.site.com` to `login.site.com`)
- Primary login flow
- Mobile devices

#### Pros

- **Extremely reliable** — works everywhere
- Resets Safari's ITP 30-day timer on the auth domain
- Works on all devices and browsers
- No popup blocker issues
- Can handle complex authentication flows (MFA, password reset, etc.)

#### Cons

- **Destroys application state** (unless carefully preserved)
- The "white flash" of navigation disrupts UX
- Slower perceived performance
- Requires state management for deep links

---

### The Popup Flow (`loginWithPopup`)

A small window opens for the login and closes upon completion.

```javascript
// Example with auth0-spa-js
await auth0.loginWithPopup({
  // options
});

// User is now authenticated, no redirect needed
```

#### Best For

- **True cross-domain** scenarios (e.g., `mysite.se` to `auth-provider.no`)
- Secondary authentication actions (adding another account)
- Desktop applications

#### Pros

- **Preserves application state** completely
- Feels "snappier" on desktop
- No navigation disruption
- Better for multi-step flows within your app

#### Cons

- **Blocked by popup blockers** (especially on mobile)
- Fragile connections — often lose `window.opener` link after 60 seconds
- **Terrible UX on mobile** devices
- May silently fail with no clear error to users
- Users may close the popup accidentally

---

## Part 3: Edge Cases Libraries Don't Solve

Even excellent libraries like `auth0-spa-js` handle the core OAuth/OIDC flows beautifully, but they **cannot solve browser-specific quirks and edge cases** for you. Here are the critical issues you must handle yourself:

### 1. Not Hitting Silent Auth All the Time

**Problem:** If your app calls `getTokenSilently()` on every page load or navigation, you'll hammer the auth server with iframe requests.

**Solution:** Maintain a first-party cookie or session storage flag with the token expiration time:

```javascript
// Set a first-party cookie when you get a token
function setTokenExpiryMarker(expiresIn) {
  const expiryTime = Date.now() + expiresIn * 1000;
  document.cookie = `token_valid_until=${expiryTime}; path=/; SameSite=Lax; Secure`;
}

// Check before calling getTokenSilently
async function getToken() {
  const tokenValidUntil = getCookie("token_valid_until");

  if (tokenValidUntil && Date.now() < parseInt(tokenValidUntil)) {
    // Token should still be valid in memory cache
    return await auth0.getTokenSilently({ cacheMode: "cache-only" });
  }

  // Need to refresh
  const token = await auth0.getTokenSilently();
  setTokenExpiryMarker(3600); // 1 hour
  return token;
}
```

### 2. Safari's 30-Day ITP Wall

**Problem:** Safari's Intelligent Tracking Prevention (ITP) deletes third-party cookies and even localStorage for domains you haven't interacted with in 30 days. This kills silent authentication.

**Solution Strategies:**

#### A. Force Redirect on Silent Auth Failure

```javascript
async function authenticate() {
  try {
    await auth0.getTokenSilently();
  } catch (error) {
    if (error.error === "login_required") {
      // Silent auth failed, probably ITP
      // Force a redirect to reset the timer
      // This will navigate away - errors handled in callback
      await auth0.loginWithRedirect({
        authorizationParams: {
          prompt: "none", // Try to skip login screen if possible
        }
      });
    }
  }
}
```

#### B. Warn Users Before the 30-Day Deadline

```javascript
// Store last successful auth timestamp
function recordAuthInteraction() {
  localStorage.setItem("last_auth_interaction", Date.now().toString());
}

// Check if approaching the deadline
function checkITPDeadline() {
  const lastInteraction = localStorage.getItem("last_auth_interaction");
  if (lastInteraction) {
    const daysSinceAuth =
      (Date.now() - parseInt(lastInteraction)) / (1000 * 60 * 60 * 24);

    if (daysSinceAuth > 25) {
      // Show warning: "You'll need to log in again soon"
      showReauthenticationWarning();
    }
  }
}
```

### 3. CHIPS (Partitioned Cookies) for Cross-Subdomain Auth

**Background:** While Google abandoned full third-party cookie deprecation in 2024 (shifting to user choice), CHIPS provides a reliable solution for cross-subdomain authentication, particularly on Android devices where cookie persistence has historically been problematic.

#### The Android Cookie Persistence Problem

On Android, third-party cookies technically work—silent auth via iframes functions correctly. However, Android's cookie storage behaves differently from desktop browsers:

- **Browser/WebView updates** trigger cookie jar cleanups that wipe standard third-party cookies
- **System updates** can also clear non-essential cookie storage
- **App updates** (for apps using WebView) often reset the cookie state

The result: users are unexpectedly logged out after updates, even though they were "remembered" before. This is particularly frustrating on Android where Chrome and WebView updates happen frequently in the background.

**CHIPS cookies are treated differently.** Because they're explicitly partitioned and marked for cross-site use, they survive these cleanup operations. This makes CHIPS essential for reliable Android authentication—not because standard cookies are blocked, but because they don't persist.

**Solution:** This requires **server-side changes** to your auth server:

```http
Set-Cookie: session=abc123; SameSite=None; Secure; Partitioned
```

CHIPS cookies are **partitioned per top-level site**, which means:

- A CHIPS cookie set from `login.auth.com` while on `app-a.com` is separate from
- A CHIPS cookie set from `login.auth.com` while on `app-b.com`

**This kills true cross-domain SSO** (different domains). However, **cross-subdomain SSO works** (e.g., `app.company.com` and `admin.company.com` sharing `auth.company.com`).

**Browser Support:**
- ✅ **Chrome/Android**: Full support, solves cookie persistence issues on Android
- ❌ **Safari/iOS**: Safari 18.4 briefly added support, but WebKit subsequently disabled it
- ✅ **Firefox**: Supported

**Recommended Approach:** Use CHIPS as the primary method with a `prompt=none` redirect fallback:

```javascript
// Step 1: Try silent auth first (works with CHIPS on Chrome/Android)
async function ensureAuthenticated() {
  try {
    return await auth0.getTokenSilently();
  } catch (error) {
    if (error.error === 'login_required') {
      // Silent auth failed - initiate prompt=none redirect
      // Note: This navigates away, so code after this won't execute
      await auth0.loginWithRedirect({
        authorizationParams: {
          prompt: 'none'
        }
      });
    }
    throw error;
  }
}

// Step 2: Handle the redirect callback (on your callback page or app init)
async function handleAuthCallback() {
  // Check if this is a redirect callback
  if (window.location.search.includes('code=') || 
      window.location.search.includes('error=')) {
    try {
      await auth0.handleRedirectCallback();
      // Success! User is now authenticated
    } catch (error) {
      // prompt=none failures arrive here as errors
      // Common errors: 'login_required', 'consent_required', 'interaction_required'
      if (error.error === 'login_required' || 
          error.error === 'interaction_required') {
        // No existing session on auth server - need interactive login
        await auth0.loginWithRedirect();
      }
    }
  }
}
```

> **Important:** `loginWithRedirect` causes a full page navigation. Errors from `prompt=none` (like `login_required`) are returned as URL parameters after the redirect and must be handled in `handleRedirectCallback()`, not in a try-catch around the redirect call.

This combination provides reliable cross-subdomain authentication across all platforms.

### 4. iOS Safari Back Button Freeze

**Problem:** On iOS Safari, if you navigate away from an SPA (using the browser back button) and then navigate forward again, JavaScript may not execute properly. Pending promises from silent auth can hang forever.

**Solution:** Implement timeouts and reauth on visibility change:

```javascript
async function getTokenWithTimeout(timeoutMs = 10000) {
  return Promise.race([
    auth0.getTokenSilently(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Token fetch timeout")), timeoutMs),
    ),
  ]);
}

// Re-check authentication when page becomes visible
document.addEventListener("visibilitychange", async () => {
  if (!document.hidden) {
    try {
      await getTokenWithTimeout(5000);
    } catch (error) {
      // Timeout or error - might need to redirect
      console.warn("Auth check failed on visibility change", error);
    }
  }
});
```

### 5. The "Ghost" Query String (Link Tracking Protection)

**Problem:** Some privacy features (like iOS Mail Link Tracking Protection) strip query parameters before the page loads. If your authentication callback relies on `?code=...` or `?state=...` in the URL, **it may disappear before your JavaScript runs**.

**Solution:** Use hash fragments instead of query parameters for your callback:

```javascript
// Configure your auth client to use hash-based responses
const auth0 = new Auth0Client({
  domain: "your-auth-server.com",
  clientId: "your-client-id",
  authorizationParams: {
    response_mode: "fragment", // Use #code=... instead of ?code=...
  },
});
```

Hash fragments (#) are never sent to the server and are **more resistant to stripping** by privacy features.

### 6. Handling Storage Access Blocking

**Problem:** Some browsers (Safari, Firefox with privacy mode) may block access to localStorage or sessionStorage in certain contexts (iframes, private browsing).

**Solution:** Implement fallback storage mechanisms:

```javascript
class StorageManager {
  constructor() {
    this.useStorage = this.detectStorageAvailability();
    this.memoryCache = new Map();
  }

  detectStorageAvailability() {
    try {
      const test = "__storage_test__";
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }

  set(key, value) {
    if (this.useStorage) {
      localStorage.setItem(key, value);
    } else {
      this.memoryCache.set(key, value);
    }
  }

  get(key) {
    if (this.useStorage) {
      return localStorage.getItem(key);
    } else {
      return this.memoryCache.get(key);
    }
  }
}

const storage = new StorageManager();
```

---

## Part 4: Recommended Implementations by Use Case

### Single-Domain SPA (e.g., `app.company.com`)

**Recommended Architecture:** Refresh Tokens

**Flow:** Redirect for login, Refresh Tokens for renewal

```javascript
const auth0 = new Auth0Client({
  domain: "auth.company.com",
  clientId: "spa-client-id",
  useRefreshTokens: true,
  cacheLocation: "localstorage",
  authorizationParams: {
    response_mode: "fragment",
    scope: "openid profile email offline_access",
  },
});

// Login
await auth0.loginWithRedirect();

// On callback page
await auth0.handleRedirectCallback();

// Get token (uses refresh token automatically when needed)
const token = await auth0.getTokenSilently();
```

### Multi-Domain SSO (e.g., `app-a.com` and `app-b.com`)

**Bad News:** True cross-domain SSO is dying in 2026.

**Best Compromise:** Refresh Tokens + UX Optimization

- Use Refresh Tokens on each domain independently
- Optimize the login flow with `prompt=none` to skip re-entry of credentials
- Set long-lived refresh tokens (30+ days)
- Consider federated identity (social logins) to reduce friction

```javascript
// On each domain, try silent login first via redirect
// Step 1: Initiate the prompt=none redirect
await auth0.loginWithRedirect({
  authorizationParams: {
    prompt: "none", // Skip login UI if session exists on auth server
  },
});

// Step 2: Handle the callback (this runs after redirect returns)
async function handleCallback() {
  try {
    await auth0.handleRedirectCallback();
    // Success - user had an existing session
  } catch (error) {
    // prompt=none failed - no existing session, need interactive login
    if (error.error === 'login_required' || 
        error.error === 'interaction_required') {
      await auth0.loginWithRedirect();
    }
  }
}
```

> **Note:** Errors from `prompt=none` are returned via URL parameters after the redirect completes. Handle them in your callback handler, not with try-catch around `loginWithRedirect`.

### High-Security Applications

**Recommended Architecture:** BFF (Backend-for-Frontend)

**Benefits:**

- Zero token exposure to JavaScript
- Can implement sophisticated security policies server-side
- Immune to XSS-based token theft

**Trade-offs:**

- More complex architecture
- Higher operational costs
- No cross-domain support

---

## Part 5: Testing Your Implementation

### Critical Tests to Run

1. **Popup Blocker Test:**
   - Try `loginWithPopup()` after a delayed action (not direct user click)
   - Verify graceful fallback to redirect

2. **iOS Back Button Test:**
   - Navigate away from your SPA
   - Use iOS Safari back button to return
   - Verify app re-initializes correctly

3. **30-Day ITP Simulation:**
   - Clear Safari cookies
   - Wait 30+ days (or manually delete ITP state)
   - Verify fallback to redirect login

4. **Token Expiry During Inactivity:**
   - Leave app open for longer than access token lifetime
   - Return and interact
   - Verify seamless refresh

5. **Network Interruption During Auth:**
   - Start login flow
   - Disable network mid-flow
   - Verify error handling and recovery

6. **Cross-Tab Authentication:**
   - Open app in two tabs
   - Log in via one tab
   - Verify other tab detects authentication

---

## Conclusion

In 2026, SPA authentication is a game of trade-offs:

- **Security vs. Convenience:** BFF is most secure but requires server infrastructure
- **Cross-Domain vs. Privacy:** True SSO is dying; Refresh Tokens are the future
- **UX vs. Reliability:** Redirects are rock-solid; popups are fragile but smoother

**Our recommendation for most modern SPAs:** Use **Refresh Tokens with Redirect Flow** as your primary method. This gives you:

- ✅ Security (with proper rotation)
- ✅ Privacy compliance
- ✅ Reliability across all browsers and devices
- ❌ Cross-domain SSO (but that's dying anyway)

Whatever you choose, remember: **Libraries handle the protocol, but you must handle the browsers.**

---

## Additional Resources

- [OAuth 2.0 for Browser-Based Apps (IETF Draft)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)
- [CHIPS Specification](https://developers.google.com/privacy-sandbox/3pcd/chips)
- [Safari ITP Documentation](https://webkit.org/tracking-prevention/)
- [Auth0 SPA SDK Documentation](https://auth0.com/docs/libraries/auth0-spa-js)
