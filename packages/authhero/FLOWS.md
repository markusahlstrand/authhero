# AuthHero Universal Login Flows

This document describes the flow system used by AuthHero's Universal Login, which is designed to be compatible with Auth0's Universal Login identifier-first flow.

## Overview

AuthHero uses a **screen-based flow system** where the backend determines which screen to show based on:
- User input (email, phone, etc.)
- Tenant configuration (enabled connections, MFA settings)
- User state (existing user, new user, MFA enrolled)

The widget communicates with the backend via a JSON API, receiving screen definitions that describe what UI to render.

## Flow Widget Page

A ready-to-use page that embeds the widget and connects to the flow API:

```
GET /u/flow-widget/:formId?state=<login_session_state>
```

This page:
- Loads the `authhero-widget` web component
- Fetches the initial screen from the flow API
- Handles form submissions and screen transitions
- Applies branding (colors, logo, fonts)
- Handles social login redirects
- Manages link navigation

### Usage

Redirect users to the flow widget page after initiating an authorization request:

```
https://auth.example.com/u/flow-widget/login-form?state=abc123
```

The page will:
1. Load the widget with the tenant's branding
2. Display the first screen (identifier input)
3. Handle user interactions (form submit, social login, links)
4. Redirect to the callback URL upon completion

## Flow API Endpoints

The Flow API supports two URL patterns to accommodate different deployment scenarios:

### Hosted Mode (Path-Based)
For server-rendered pages where the form ID is known at page load time.
```
/u/flow/:formId/screen?state=<state>&nodeId=<optional_node_id>
```

### SPA Mode (Query-Based)
For single-page applications where the form and screen are controlled via query parameters.
```
/u/flow/screen?form=<formId>&state=<state>&screen=<optional_node_id>
```

---

### GET - Fetch Current Screen

**Hosted Mode:**
```
GET /u/flow/:formId/screen?state=<login_session_state>&nodeId=<optional_node_id>
```

**SPA Mode:**
```
GET /u/flow/screen?form=<formId>&state=<login_session_state>&screen=<optional_node_id>
```

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `state` | Yes | The login session state from the authorization request |
| `form` | Yes (SPA) | The form ID to load (SPA mode only) |
| `nodeId` / `screen` | No | Specific node/screen to render (for deep linking or back navigation) |

**Response:**
```json
{
  "screen": {
    "action": "/u/flow/:formId/screen?state=...",
    "method": "POST",
    "title": "Welcome",
    "description": "Sign in to continue",
    "components": [...],
    "messages": [],
    "links": []
  },
  "branding": {
    "colors": { "primary": "#6366f1", "page_background": "#ffffff" },
    "logo_url": "https://...",
    "font": { "url": "https://fonts.googleapis.com/..." }
  }
}
```

> **Note:** The `action` URL in the response will match the mode used in the request. Hosted mode returns path-based URLs, SPA mode returns query-based URLs.

### POST - Submit Form Data

**Hosted Mode:**
```
POST /u/flow/:formId/screen?state=<login_session_state>&nodeId=<optional_node_id>
Content-Type: application/json

{
  "data": {
    "email": "user@example.com",
    "password": "..."
  }
}
```

**SPA Mode:**
```
POST /u/flow/screen?form=<formId>&state=<login_session_state>&screen=<optional_node_id>
Content-Type: application/json

{
  "data": {
    "email": "user@example.com",
    "password": "..."
  }
}
```

**Response (next screen):**
```json
{
  "screen": { ... },
  "branding": { ... }
}
```

**Response (redirect to app):**
```json
{
  "redirect": "https://app.example.com/callback?code=..."
}
```

**Response (validation error):**
```json
{
  "screen": {
    "components": [
      {
        "id": "email",
        "type": "EMAIL",
        "messages": [{ "text": "Invalid email format", "type": "error" }]
      }
    ],
    "messages": [{ "text": "Please correct the errors", "type": "error" }]
  }
}
```

---

## Identifier-First Flow

The **identifier-first flow** (default in Auth0 Universal Login) separates the login process into multiple screens:

1. **Identifier Screen** - User enters email/phone
2. **Password Screen** - User enters password (if password connection)
3. **Code Screen** - User enters OTP code (if passwordless/MFA)
4. **Signup Screen** - User completes registration (if new user)

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AUTHORIZE REQUEST                               │
│                    GET /authorize?client_id=...&...                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           IDENTIFIER SCREEN                                  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [Logo]                                                              │   │
│  │                                                                      │   │
│  │  Welcome                                                             │   │
│  │  Sign in to {app_name} to continue                                  │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │ Email address                                                 │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  │  [          Continue          ]                                     │   │
│  │                                                                      │   │
│  │  ─────────────────── OR ───────────────────                         │   │
│  │                                                                      │   │
│  │  [    Continue with Google    ]                                     │   │
│  │  [    Continue with GitHub    ]                                     │   │
│  │                                                                      │   │
│  │  Don't have an account? Sign up                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌───────────┐     ┌───────────┐     ┌───────────┐
            │  Social   │     │  Existing │     │    New    │
            │   Login   │     │   User    │     │   User    │
            └───────────┘     └───────────┘     └───────────┘
                    │                 │                 │
                    │                 ▼                 ▼
                    │    ┌─────────────────────────────────────────────────┐
                    │    │              PASSWORD SCREEN                    │
                    │    │                                                 │
                    │    │  ┌─────────────────────────────────────────┐   │
                    │    │  │  Enter your password                    │   │
                    │    │  │                                         │   │
                    │    │  │  user@example.com            [Edit]     │   │
                    │    │  │                                         │   │
                    │    │  │  ┌─────────────────────────────────┐   │   │
                    │    │  │  │ Password                        │   │   │
                    │    │  │  └─────────────────────────────────┘   │   │
                    │    │  │                                         │   │
                    │    │  │  [          Continue          ]        │   │
                    │    │  │                                         │   │
                    │    │  │  Forgot password?                       │   │
                    │    │  └─────────────────────────────────────────┘   │
                    │    │                                                 │
                    │    └─────────────────────────────────────────────────┘
                    │                         │
                    │                         ▼
                    │    ┌─────────────────────────────────────────────────┐
                    │    │        MFA SCREEN (if MFA enabled)             │
                    │    │                                                 │
                    │    │  ┌─────────────────────────────────────────┐   │
                    │    │  │  Verify your identity                   │   │
                    │    │  │                                         │   │
                    │    │  │  Enter the code from your              │   │
                    │    │  │  authenticator app                      │   │
                    │    │  │                                         │   │
                    │    │  │  ┌─────────────────────────────────┐   │   │
                    │    │  │  │ ______                          │   │   │
                    │    │  │  └─────────────────────────────────┘   │   │
                    │    │  │                                         │   │
                    │    │  │  [          Verify          ]          │   │
                    │    │  └─────────────────────────────────────────┘   │
                    │    │                                                 │
                    │    └─────────────────────────────────────────────────┘
                    │                         │
                    ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CALLBACK                                        │
│                    Redirect to app with code/token                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Signup Flow (New User)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SIGNUP SCREEN                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Create your account                                                 │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │ Email address                          user@example.com       │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │ Password                                                      │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  │  □ I agree to the Terms of Service and Privacy Policy              │   │
│  │                                                                      │   │
│  │  [          Sign up          ]                                      │   │
│  │                                                                      │   │
│  │  Already have an account? Log in                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Passwordless Flow (Code)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CODE SCREEN                                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Check your email                                                    │   │
│  │                                                                      │   │
│  │  We sent a code to user@example.com                                 │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │ Enter code                                                    │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  │  [          Continue          ]                                     │   │
│  │                                                                      │   │
│  │  Didn't receive the code? Resend                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen Types

### 1. Identifier Screen (`login-id`)

The entry point for authentication. Shows:
- Email/phone input
- Social login buttons (based on enabled connections)
- Sign up link

**Components:**
```json
{
  "components": [
    { "id": "email", "type": "EMAIL", "category": "FIELD", "required": true },
    { "id": "submit", "type": "NEXT_BUTTON", "category": "BLOCK", "config": { "text": "Continue" } },
    { "id": "divider", "type": "DIVIDER", "category": "BLOCK" },
    { "id": "google", "type": "SOCIAL", "category": "FIELD", "config": { "providers": ["google-oauth2"] } }
  ],
  "links": [
    { "id": "signup", "text": "Don't have an account?", "linkText": "Sign up", "href": "/u/signup" }
  ]
}
```

### 2. Password Screen (`login-password`)

Shown after identifier for users with password connection.

**Components:**
```json
{
  "components": [
    { "id": "info", "type": "RICH_TEXT", "category": "BLOCK", "config": { "content": "<p>user@example.com</p>" } },
    { "id": "password", "type": "PASSWORD", "category": "FIELD", "required": true },
    { "id": "submit", "type": "NEXT_BUTTON", "category": "BLOCK", "config": { "text": "Continue" } }
  ],
  "links": [
    { "id": "forgot", "text": "Forgot password?", "href": "/u/forgot-password" },
    { "id": "back", "text": "Not you?", "linkText": "Use another account", "href": "/u/login/identifier" }
  ]
}
```

### 3. Code Screen (`login-code`)

Shown for passwordless or MFA verification.

**Components:**
```json
{
  "components": [
    { "id": "info", "type": "RICH_TEXT", "category": "BLOCK", "config": { "content": "<p>We sent a code to user@example.com</p>" } },
    { "id": "code", "type": "TEXT", "category": "FIELD", "required": true, "config": { "placeholder": "Enter code" } },
    { "id": "submit", "type": "NEXT_BUTTON", "category": "BLOCK", "config": { "text": "Continue" } },
    { "id": "resend", "type": "RESEND_BUTTON", "category": "BLOCK", "config": { "text": "Resend code" } }
  ]
}
```

### 4. Signup Screen (`signup`)

Shown for new user registration.

**Components:**
```json
{
  "components": [
    { "id": "email", "type": "EMAIL", "category": "FIELD", "required": true },
    { "id": "password", "type": "PASSWORD", "category": "FIELD", "required": true },
    { "id": "terms", "type": "LEGAL", "category": "FIELD", "required": true, "config": { "text": "I agree to the Terms of Service" } },
    { "id": "submit", "type": "NEXT_BUTTON", "category": "BLOCK", "config": { "text": "Sign up" } }
  ],
  "links": [
    { "id": "login", "text": "Already have an account?", "linkText": "Log in", "href": "/u/login/identifier" }
  ]
}
```

### 5. Reset Password Screen (`reset-password`)

Shown when user requests password reset.

**Components:**
```json
{
  "components": [
    { "id": "email", "type": "EMAIL", "category": "FIELD", "required": true },
    { "id": "submit", "type": "NEXT_BUTTON", "category": "BLOCK", "config": { "text": "Send reset link" } }
  ],
  "links": [
    { "id": "back", "text": "Back to", "linkText": "Log in", "href": "/u/login/identifier" }
  ]
}
```

---

## Decision Logic

The backend uses the following logic to determine which screen to show:

### After Identifier Submission

```
POST /u/flow/:formId/screen (with email)
                │
                ▼
        ┌───────────────┐
        │ Lookup user   │
        │ by email      │
        └───────────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
   User exists    User not found
        │               │
        ▼               ▼
┌───────────────┐ ┌───────────────┐
│ Get user's    │ │ Check tenant  │
│ connections   │ │ signup config │
└───────────────┘ └───────────────┘
        │               │
        ▼               │
┌───────────────┐       │
│ Password      │       │
│ connection?   │       │
└───────────────┘       │
    │       │           │
   Yes      No          │
    │       │           │
    ▼       ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐
│Password│ │  Code  │ │ Signup │
│ Screen │ │ Screen │ │ Screen │
└────────┘ └────────┘ └────────┘
```

### After Password/Code Submission

```
POST /u/flow/:formId/screen (with password/code)
                │
                ▼
        ┌───────────────┐
        │ Validate      │
        │ credentials   │
        └───────────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
   Valid            Invalid
        │               │
        ▼               ▼
┌───────────────┐ ┌───────────────┐
│ MFA enabled?  │ │ Return error  │
└───────────────┘ │ on same screen│
    │       │     └───────────────┘
   Yes      No
    │       │
    ▼       ▼
┌────────┐ ┌────────┐
│  MFA   │ │Complete│
│ Screen │ │Redirect│
└────────┘ └────────┘
```

---

## Component Types Reference

### FIELD Components (inputs)

| Type | Description | Config Options |
|------|-------------|----------------|
| `EMAIL` | Email input | `label`, `placeholder` |
| `PASSWORD` | Password input | `label`, `placeholder`, `show_toggle` |
| `TEXT` | Text input | `label`, `placeholder`, `multiline` |
| `NUMBER` | Number input | `label`, `placeholder`, `min`, `max` |
| `PHONE` | Phone input | `label`, `placeholder`, `default_country` |
| `BOOLEAN` | Checkbox | `default_value` |
| `LEGAL` | Terms checkbox | `text`, `html` |
| `DROPDOWN` | Select dropdown | `options`, `placeholder` |
| `SOCIAL` | Social login buttons | `providers` |

### BLOCK Components (non-inputs)

| Type | Description | Config Options |
|------|-------------|----------------|
| `NEXT_BUTTON` | Submit/continue button | `text` |
| `PREVIOUS_BUTTON` | Back button | `text` |
| `RESEND_BUTTON` | Resend code button | `text` |
| `JUMP_BUTTON` | Navigate to step | `text`, `target_step` |
| `DIVIDER` | Visual separator | - |
| `RICH_TEXT` | HTML content | `content` |
| `IMAGE` | Image display | `src`, `alt`, `width`, `height` |
| `HTML` | Raw HTML | `content` |

---

## Integration with Widget

The `@authhero/widget` component consumes these screens:

```html
<authhero-widget
  flow-url="/u/flow/login/screen"
  state="abc123"
></authhero-widget>
```

The widget:
1. Fetches the initial screen via GET
2. Renders components based on type
3. Collects form data on submit
4. POSTs data to the action URL
5. Handles response (next screen, redirect, or error)

### Widget Events

```javascript
const widget = document.querySelector('authhero-widget');

// Form submitted
widget.addEventListener('submit', (e) => {
  console.log('Submitted:', e.detail.data);
});

// Social login clicked
widget.addEventListener('socialLogin', (e) => {
  console.log('Provider:', e.detail.provider);
});

// Link clicked
widget.addEventListener('linkClick', (e) => {
  console.log('Link:', e.detail.href);
});

// Flow completed
widget.addEventListener('complete', (e) => {
  console.log('Redirect:', e.detail.redirect);
});
```

---

## Comparison with Auth0

| Feature | Auth0 | AuthHero |
|---------|-------|----------|
| Identifier-first flow | ✅ | ✅ |
| Password screen | ✅ | ✅ |
| Passwordless (code) | ✅ | ✅ |
| Social connections | ✅ | ✅ |
| MFA | ✅ | ✅ |
| Signup | ✅ | ✅ |
| Password reset | ✅ | ✅ |
| Custom branding | ✅ | ✅ |
| Form components | ✅ (Auth0 Forms) | ✅ (Compatible) |
| Custom flows | ✅ (Actions/Forms) | ✅ (Form nodes) |

### Auth0 Prompt Names → AuthHero Screens

| Auth0 Prompt | AuthHero Screen |
|--------------|-----------------|
| `login-id` | Identifier screen |
| `login-password` | Password screen |
| `login` | Combined login (legacy) |
| `signup` | Signup screen |
| `signup-id` | Signup identifier |
| `signup-password` | Signup password |
| `reset-password` | Reset password |
| `mfa-push` | MFA push notification |
| `mfa-otp` | MFA OTP code |
| `mfa-sms` | MFA SMS code |
| `consent` | Consent screen |

---

## Configuration

### Tenant Settings

```json
{
  "universal_login": {
    "identifier_first": true,
    "passwordless_enabled": true,
    "signup_enabled": true,
    "social_button_style": "icon" | "text"
  }
}
```

### Connection Priority

The order of connections shown on the identifier screen:

1. Social connections (Google, GitHub, etc.)
2. Enterprise connections (SAML, OIDC)
3. Database connection (password)
4. Passwordless (email, SMS)

---

## Error Handling

### Validation Errors

Returned per-component in `messages` array:

```json
{
  "screen": {
    "components": [
      {
        "id": "email",
        "type": "EMAIL",
        "messages": [
          { "id": 1001, "text": "Email is required", "type": "error" }
        ]
      }
    ]
  }
}
```

### Global Errors

Returned in screen-level `messages`:

```json
{
  "screen": {
    "messages": [
      { "id": 2001, "text": "Invalid credentials", "type": "error" }
    ]
  }
}
```

### Error Codes

| Code | Message |
|------|---------|
| 1001 | Field is required |
| 1002 | Invalid email format |
| 1003 | Password too short |
| 1004 | Invalid code |
| 2001 | Invalid credentials |
| 2002 | Account locked |
| 2003 | Email not verified |
| 2004 | MFA required |
| 3001 | Session expired |
| 3002 | Rate limited |

---

## Choosing Between Hosted and SPA Modes

### When to Use Hosted Mode (Path-Based)

Use hosted mode when:
- Building a server-rendered login page
- Using the `/u/flow-widget/:formId` page
- The form ID is known at page load time
- You want cleaner URLs for bookmarking/sharing

**Example URL:**
```
https://auth.example.com/u/flow/login-form/screen?state=abc123
```

### When to Use SPA Mode (Query-Based)

Use SPA mode when:
- Building a custom SPA that embeds the widget
- The form might change dynamically during the session
- You need to control navigation via URL parameters
- Supporting back/forward browser navigation through flow screens

**Example URL:**
```
https://auth.example.com/u/flow/screen?form=login-form&state=abc123&screen=password-step
```

### State Management

Both modes share the same state management:
- The `state` parameter identifies the login session (server-side)
- Current flow progress is stored in the login session
- The widget doesn't need to maintain local state

### Deep Linking / Back Navigation

Use the `nodeId` (hosted) or `screen` (SPA) parameter to:
- Deep link directly to a specific screen
- Support browser back/forward navigation
- Resume a flow at a specific point

---

## SPA Integration

For Single Page Applications that want to render their own login UI using the AuthHero widget, use the standard OAuth2/OIDC flow with your SPA's login page as the `redirect_uri`.

### Step 1: Initiate Authorization

Redirect to the standard `/authorize` endpoint, setting `redirect_uri` to your SPA's login page:

```typescript
function startLogin() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: 'your-client-id',
    redirect_uri: window.location.origin + '/login', // Your SPA's login page
    scope: 'openid profile email',
    state: crypto.randomUUID(), // Your CSRF token (separate from login_ticket)
  });
  
  window.location.href = `https://auth.example.com/authorize?${params}`;
}
```

### Step 2: Extract Login Ticket

AuthHero redirects to your login page with the `state` parameter containing the login ticket:

```
https://your-app.com/login?state=<login_ticket>
```

In your SPA's `/login` route:

```typescript
// Extract login ticket from URL
const params = new URLSearchParams(window.location.search);
const loginTicket = params.get('state');

if (!loginTicket) {
  // No login ticket - redirect to start auth flow
  startLogin();
  return;
}
```

### Step 3: Fetch Initial Screen

Use the Flow API to get the current screen:

```typescript
const response = await fetch(
  `https://auth.example.com/u/flow/screen?form=login&state=${loginTicket}`
);
const { screen, branding } = await response.json();
```

### Step 4: Render the Widget

```html
<authhero-widget id="login-widget"></authhero-widget>

<script type="module">
  import '@authhero/widget';
  
  const widget = document.getElementById('login-widget');
  widget.screen = screen;
  widget.branding = branding;
</script>
```

### Step 5: Handle Form Submissions

```typescript
const widget = document.getElementById('login-widget');

widget.addEventListener('submit', async (e) => {
  const response = await fetch(
    `https://auth.example.com/u/flow/screen?form=login&state=${loginTicket}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: e.detail }),
    }
  );
  
  const result = await response.json();
  
  if (result.redirect) {
    // Auth complete - redirect contains the authorization code
    // Option A: Full redirect (simplest)
    window.location.href = result.redirect;
    
    // Option B: Extract code and exchange via fetch (for true SPA)
    // const url = new URL(result.redirect);
    // const code = url.searchParams.get('code');
    // await exchangeCodeForTokens(code);
  } else if (result.screen) {
    // Show next screen
    widget.screen = result.screen;
  }
});
```

### Complete Example

```typescript
// login.ts - Your SPA's login page
import '@authhero/widget';

const AUTH_DOMAIN = 'https://auth.example.com';
const CLIENT_ID = 'your-client-id';

async function initLogin() {
  const params = new URLSearchParams(window.location.search);
  const loginTicket = params.get('state');
  
  // No login ticket? Start the auth flow
  if (!loginTicket) {
    const authParams = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: window.location.origin + '/login',
      scope: 'openid profile email',
      state: crypto.randomUUID(),
    });
    window.location.href = `${AUTH_DOMAIN}/authorize?${authParams}`;
    return;
  }
  
  // Fetch initial screen
  const response = await fetch(
    `${AUTH_DOMAIN}/u/flow/screen?form=login&state=${loginTicket}`
  );
  const { screen, branding } = await response.json();
  
  // Render widget
  const widget = document.querySelector('authhero-widget');
  widget.screen = screen;
  widget.branding = branding;
  
  // Handle submissions
  widget.addEventListener('submit', async (e) => {
    const submitResponse = await fetch(
      `${AUTH_DOMAIN}/u/flow/screen?form=login&state=${loginTicket}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: e.detail }),
      }
    );
    
    const result = await submitResponse.json();
    
    if (result.redirect) {
      window.location.href = result.redirect;
    } else if (result.screen) {
      widget.screen = result.screen;
    }
  });
}

initLogin();
```

### CORS Configuration

Ensure your AuthHero tenant allows CORS requests from your SPA's origin:

```json
{
  "allowed_origins": ["https://your-app.com"]
}
```

---

## Widget Integration Patterns

The `authhero-widget` is a **pure UI component** that renders forms and emits events. By default, it does not handle tokens, sessions, or HTTP requests. This makes it compatible with any auth library or custom implementation.

### Widget Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `screen` | `UiScreen \| string` | - | Screen configuration to render |
| `branding` | `WidgetBranding \| string` | - | Branding (logo, colors) |
| `theme` | `WidgetTheme \| string` | - | Theme customization |
| `loading` | `boolean` | `false` | Show loading state |
| `autoSubmit` | `boolean` | `false` | Auto-handle form submissions |
| `apiUrl` | `string` | - | Fetch initial screen from URL |

### Widget Events

| Event | Payload | Description |
|-------|---------|-------------|
| `formSubmit` | `{ screen, data }` | Form submitted with field values |
| `buttonClick` | `{ id, type, value? }` | Non-submit button clicked (social, back) |
| `linkClick` | `{ id?, href, text }` | Link clicked |
| `navigate` | `{ url, replace? }` | Widget wants to navigate |
| `flowComplete` | `{ redirectUrl? }` | Auth flow completed |
| `flowError` | `{ message, code? }` | Error occurred |
| `screenChange` | `UiScreen` | Screen updated |

### Pattern 1: Event-Based (Recommended)

The widget emits events and your application handles everything:

```typescript
import '@authhero/widget';

const widget = document.querySelector('authhero-widget');
let loginTicket: string;

// Handle form submissions
widget.addEventListener('formSubmit', async (e) => {
  const { data } = e.detail;
  
  widget.loading = true;
  try {
    const response = await fetch(`/u/flow/screen?form=login&state=${loginTicket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    
    const result = await response.json();
    
    if (result.redirect) {
      // Auth complete - handle with your auth library
      window.location.href = result.redirect;
    } else if (result.screen) {
      widget.screen = result.screen;
    }
  } finally {
    widget.loading = false;
  }
});

// Handle social login buttons
widget.addEventListener('buttonClick', (e) => {
  const { type, value } = e.detail;
  
  if (type === 'SOCIAL') {
    // Redirect to social provider
    window.location.href = `/authorize?connection=${value}&state=${loginTicket}`;
  }
});

// Handle link clicks
widget.addEventListener('linkClick', (e) => {
  const { href } = e.detail;
  // Handle navigation (e.g., switch to signup form)
  // You control whether to navigate or update the screen
});
```

### Pattern 2: Auto-Submit Mode

For simpler integrations, enable `autoSubmit` to let the widget handle HTTP requests:

```html
<authhero-widget auto-submit="true"></authhero-widget>
```

```typescript
const widget = document.querySelector('authhero-widget');

// Widget handles form submission automatically
// Just listen for completion
widget.addEventListener('flowComplete', (e) => {
  const { redirectUrl } = e.detail;
  if (redirectUrl) {
    window.location.href = redirectUrl;
  }
});

// Still handle social buttons manually
widget.addEventListener('buttonClick', (e) => {
  if (e.detail.type === 'SOCIAL') {
    window.location.href = `/authorize?connection=${e.detail.value}`;
  }
});
```

### Pattern 3: With auth0-spa-js

```typescript
import { Auth0Client } from '@auth0/auth0-spa-js';
import '@authhero/widget';

const auth0 = new Auth0Client({
  domain: 'your-tenant.authhero.com',
  clientId: 'your-client-id',
});

let loginTicket: string;

// Extract login ticket from URL
const params = new URLSearchParams(window.location.search);
loginTicket = params.get('state');

// Fetch and display screen
async function initWidget() {
  const response = await fetch(`/u/flow/screen?form=login&state=${loginTicket}`);
  const { screen, branding } = await response.json();
  
  const widget = document.querySelector('authhero-widget');
  widget.screen = screen;
  widget.branding = branding;
}

// Handle form submissions
document.querySelector('authhero-widget')
  .addEventListener('formSubmit', async (e) => {
    const response = await fetch(`/u/flow/screen?form=login&state=${loginTicket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: e.detail.data }),
    });
    
    const result = await response.json();
    
    if (result.redirect) {
      // Let auth0-spa-js handle the callback
      window.location.href = result.redirect;
    } else if (result.screen) {
      document.querySelector('authhero-widget').screen = result.screen;
    }
  });

// Handle social login with auth0-spa-js
document.querySelector('authhero-widget')
  .addEventListener('buttonClick', async (e) => {
    if (e.detail.type === 'SOCIAL') {
      await auth0.loginWithRedirect({
        connection: e.detail.value,
      });
    }
  });

// Silent auth / token refresh (handled by auth0-spa-js)
async function getAccessToken() {
  try {
    return await auth0.getTokenSilently();
  } catch {
    // Need interactive login
    await auth0.loginWithRedirect();
  }
}

initWidget();
```

### Pattern 4: Custom Token Management

```typescript
import '@authhero/widget';

const tokenStorage = {
  get: () => localStorage.getItem('access_token'),
  set: (tokens) => {
    localStorage.setItem('access_token', tokens.access_token);
    if (tokens.refresh_token) {
      localStorage.setItem('refresh_token', tokens.refresh_token);
    }
  },
  clear: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
};

let loginTicket: string;

// Handle completion - exchange code for tokens
document.querySelector('authhero-widget')
  .addEventListener('formSubmit', async (e) => {
    const response = await fetch(`/u/flow/screen?form=login&state=${loginTicket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: e.detail.data }),
    });
    
    const result = await response.json();
    
    if (result.redirect) {
      // Extract code and exchange for tokens (true SPA flow)
      const url = new URL(result.redirect);
      const code = url.searchParams.get('code');
      
      if (code) {
        const tokenResponse = await fetch('/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            client_id: 'your-client-id',
            redirect_uri: window.location.origin + '/callback',
          }),
        });
        
        const tokens = await tokenResponse.json();
        tokenStorage.set(tokens);
        
        // Redirect to app
        window.location.href = '/dashboard';
      }
    } else if (result.screen) {
      document.querySelector('authhero-widget').screen = result.screen;
    }
  });

// Refresh tokens
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) throw new Error('No refresh token');
  
  const response = await fetch('/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: 'your-client-id',
    }),
  });
  
  if (!response.ok) {
    tokenStorage.clear();
    throw new Error('Refresh failed');
  }
  
  const tokens = await response.json();
  tokenStorage.set(tokens);
  return tokens.access_token;
}
```

### Pattern 5: Generic Forms (Non-Auth)

The widget can render any multi-step form, not just authentication:

```typescript
import '@authhero/widget';

const widget = document.querySelector('authhero-widget');

// Onboarding wizard
widget.screen = {
  action: '/api/onboarding',
  method: 'POST',
  title: 'Welcome! Let\'s get started',
  components: [
    {
      id: 'company_name',
      type: 'TEXT',
      category: 'FIELD',
      required: true,
      label: 'Company Name',
    },
    {
      id: 'submit',
      type: 'NEXT_BUTTON',
      category: 'BLOCK',
      config: { text: 'Continue' },
    },
  ],
};

widget.addEventListener('formSubmit', async (e) => {
  const response = await fetch('/api/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(e.detail.data),
  });
  
  const result = await response.json();
  
  if (result.nextScreen) {
    widget.screen = result.nextScreen;
  } else if (result.complete) {
    window.location.href = '/dashboard';
  }
});
```

---

## Future Enhancements

- [ ] Passkey/WebAuthn support
- [ ] Progressive profiling
- [ ] Organization login (B2B)
- [ ] Custom prompts/screens
- [ ] A/B testing for flows
- [ ] Analytics integration
