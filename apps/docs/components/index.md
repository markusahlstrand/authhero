# Component Library

AuthHero provides a set of pre-built UI components for authentication flows, built with [Hono JSX](https://hono.dev/guides/jsx) for server-side rendering.

## Overview

The component library includes fully-styled, themable components for:

- **Login Pages** - Email/phone login, social login, passwordless
- **Forms** - Input fields, buttons, validation messages
- **Layouts** - Page layouts with theming support
- **Social Buttons** - Pre-configured social login buttons (Google, Apple, Vipps, etc.)

## Features

✨ **Server-Side Rendered** - Built with Hono JSX for optimal performance  
🎨 **Themable** - Full theming support with custom colors, fonts, and layouts  
🌍 **Internationalized** - Built-in i18n support with multiple languages  
📱 **Responsive** - Mobile-first design with Tailwind CSS  
♿ **Accessible** - WCAG compliant components

## Interactive Component Library

Explore all available components, their variations, and configurations in our interactive Storybook:

<div style="margin: 2rem 0;">
  <a href="/storybook/index.html" target="_blank" style="display: inline-block; padding: 0.75rem 1.5rem; background: #3B82F6; color: white; border-radius: 0.5rem; text-decoration: none; font-weight: 600;">
    Open Component Library →
  </a>
</div>

::: tip
The Storybook opens in a new window and provides an interactive environment to explore all components with different props and states.
:::

## Available Components

### IdentifierPage

The main login page component that handles email/phone input and social login options.

**Features:**

- Email and/or phone number input
- Social login buttons (Google, Apple, Vipps, etc.)
- Error messaging
- Custom theming
- Passwordless code entry

**Usage in Storybook:**

- EmailOnly - Basic email login
- PhoneOnly - Phone number login
- EmailOrPhone - Combined email/phone input
- EmailWithGoogle - Email login with Google OAuth
- EmailWithAllSocial - Email with multiple social providers
- SocialOnly - Social login buttons only

### ContinueForm

A reusable form component for account continuation flows, typically used when a user is already logged in and needs to confirm continuing with their existing account or choose a different one.

**Features:**

- Displays current user information
- Continue with existing account button
- Switch to different account link
- Full theming support
- Dark mode support
- Internationalized messaging

**Props:**

- `state` - Current authentication state parameter
- `user` - User object with email and profile information
- `onUseAnother` - Optional callback for when user clicks "use another"
- `className` - Optional CSS class for customization

**Usage in Storybook:**

- Default - Standard continue form with Layout
- WithCustomUser - Example with different user email
- WithoutLayout - Form component only
- DarkMode - Dark theme variant

**Use Cases:**

- SSO provider account selection
- Existing session continuation
- Account linking workflows
- Multi-account scenarios

### ImpersonateForm

A specialized form component for user impersonation functionality, allowing privileged users to authenticate as different users for support and debugging purposes.

::: warning AuthHero Exclusive Feature
This impersonation feature is **not available in Auth0** and is unique to AuthHero. It provides a powerful tool for customer support and system administration.
:::

**Features:**

- Current user display with visual indicator
- Continue as current user option
- Advanced impersonation by user ID
- Collapsible advanced options section
- Full theming support
- Permission-based access control
- Dark mode support
- Internationalized messaging

**Props:**

- `state` - Current authentication state parameter
- `user` - Current authenticated user with impersonation permission
- `client` - Client configuration
- `error` - Optional error message (e.g., user not found)
- `theme` - Optional theme configuration
- `branding` - Optional branding configuration
- `className` - Optional CSS class for customization

**Usage in Storybook:**

- Default - Standard impersonation form
- WithError - Form with error message displayed
- WithCustomUser - Example with different admin user
- WithTheming - Purple-themed variant
- DarkMode - Dark theme variant

**Use Cases:**

- Customer support scenarios
- Debugging user-specific issues
- Admin testing of user permissions
- Account verification workflows

**Security Requirements:**

- User must have `users:impersonate` permission
- Displayed **after** successful authentication
- Original user tracked in authentication tokens (act claim)
- Post-login hooks are skipped during impersonation

### LoginForm

A password-based login form component for authenticating users with their email and password.

**Features:**

- Email display (pre-filled from previous step)
- Password input field with proper security
- Error message display
- Forgot password link
- Optional "email me a code" alternative
- Full theming support
- Dark mode support
- Internationalized messaging

**Props:**

- `state` - Current authentication state parameter
- `email` - User's email address (pre-filled)
- `client` - Client configuration
- `error` - Optional error message (e.g., invalid password)
- `theme` - Optional theme configuration
- `branding` - Optional branding configuration
- `showCodeOption` - Whether to show the "email me a code" option (default: true)
- `className` - Optional CSS class for customization

**Usage in Storybook:**

- Default - Standard password login form with code option
- WithError - Form with invalid password error
- WithoutCodeOption - Password-only login (no code alternative)
- WithLongEmail - Demonstrates handling of long email addresses
- WithTheming - Green-themed variant
- DarkMode - Dark theme variant

**Use Cases:**

- Username/password authentication
- Traditional login flows
- Enterprise SSO with password fallback
- Applications requiring password authentication

### AccountForm

An account management form component that displays user profile information and allows editing.

**Features:**

- User email display with edit button
- Optional linked accounts display
- Account unlinking functionality
- Success and error message display
- Full theming support
- Dark mode support
- Internationalized messaging
- Responsive design with text truncation

**Props:**

- `state` - Current authentication state parameter
- `user` - User object with email and profile information
- `client` - Client configuration
- `error` - Optional error message
- `success` - Optional success message
- `theme` - Optional theme configuration
- `branding` - Optional branding configuration
- `showLinkedAccounts` - Whether to show linked accounts section (default: false)
- `className` - Optional CSS class for customization

**Usage in Storybook:**

- Default - Standard account settings view
- WithSuccess - Form with success message
- WithError - Form with error message
- WithLinkedAccounts - Shows multiple linked social accounts
- WithLongEmail - Demonstrates truncation of long email addresses
- WithTheming - Purple-themed variant
- DarkMode - Dark theme variant with linked accounts

**Use Cases:**

- User profile management
- Account settings pages
- Email update workflows
- Social account linking/unlinking
- User self-service portals

### ChangeEmailForm

A form component for users to change their email address with verification.

**Features:**

- Current email display
- New email input field
- Verification code information
- Error message display
- Full theming support
- Dark mode support
- Internationalized messaging
- Input validation

**Props:**

- `state` - Current authentication state parameter
- `user` - User object with current email
- `client` - Client configuration
- `error` - Optional error message (e.g., email in use)
- `theme` - Optional theme configuration
- `branding` - Optional branding configuration
- `className` - Optional CSS class for customization

**Usage in Storybook:**

- Default - Standard email change form
- WithError - Form with error message (email in use)
- WithLongCurrentEmail - Demonstrates handling of long email addresses
- WithTheming - Green-themed variant
- DarkMode - Dark theme variant

**Use Cases:**

- Email address updates
- Account recovery flows
- Profile information updates
- Email verification workflows

### Additional Components

- **Layout** - Main page layout wrapper with theme support
- **Form** - Form wrapper with styling
- **Button** - Styled button component
- **ErrorMessage** - Error display component
- **SocialButton** - Individual social provider button
- **Icon** - Icon component for various UI elements

## Theming

All components support comprehensive theming through the `Theme` object:

```typescript
interface Theme {
  colors: {
    primary_button: string;
    primary_button_label: string;
    widget_background: string;
    // ... and many more
  };
  fonts: {
    title: { bold: boolean; size: number };
    body_text: { bold: boolean; size: number };
    // ... and more
  };
  borders: {
    button_border_radius: number;
    inputs_style: "pill" | "rounded" | "sharp";
    // ... and more
  };
  widget: {
    logo_url: string;
    logo_position: "center" | "left" | "right" | "none";
    social_buttons_layout: "bottom" | "top";
  };
}
```

## Internationalization

Components support multiple languages out of the box:

- 🇬🇧 English
- 🇳🇴 Norwegian (Bokmål)
- 🇸🇪 Swedish
- 🇩🇰 Danish
- 🇫🇮 Finnish
- 🇵🇱 Polish
- 🇨🇿 Czech
- 🇮🇹 Italian

Translation keys are automatically loaded and applied based on the user's locale.

## Using Components

### In Hono Applications

```typescript
import { IdentifierPage } from 'authhero';

app.get('/login', (c) => {
  return c.html(
    <IdentifierPage
      theme={theme}
      branding={branding}
      loginSession={session}
      client={client}
    />
  );
});
```

### Server-Side Rendering

Components are designed for server-side rendering and return HTML strings that can be sent directly to the browser:

```typescript
const html = IdentifierPage({
  theme,
  branding,
  loginSession,
  client,
});
// html is a string ready to be sent to the client
```

## Client-Side Features

### Incognito Mode Detection

AuthHero automatically detects when users are browsing in incognito/private mode and displays a warning message. This helps inform users about potential session persistence issues.

**How it works:**

- Detection runs automatically on login pages when the client script loads
- Uses the `detectincognitojs` library loaded from CDN
- Results are cached in sessionStorage to avoid repeated detection
- Warning is shown/hidden dynamically without page reload

**Warning Message:**

The warning appears at the top of the login form with:

- ⚠️ Warning icon
- "Incognito Mode Detected" heading
- Information about potential session data persistence issues

**Implementation:**

```typescript
// Server-side: Warning div is always rendered (hidden by default)
<div
  id="incognito-warning-container"
  className="mb-4 hidden rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800"
  role="alert"
>
  <div className="flex items-start gap-3">
    <span className="text-lg leading-none">⚠️</span>
    <div>
      <strong>Incognito Mode Detected</strong>
      <p className="mt-1 text-xs opacity-90">
        You are in incognito/private mode. Session data may not persist
        across page refreshes. Some features might not work as expected.
      </p>
    </div>
  </div>
</div>

// Client-side: Detection handler removes 'hidden' class when incognito is detected
```

**Features:**

- ✅ Automatic detection on page load
- ✅ Cached results for performance
- ✅ No console logging in production
- ✅ Graceful fallback if detection fails
- ✅ Works in both classic and shadcn UI styles
- ✅ Internationalization support via i18next

**Testing:**

You can test the incognito detection in Storybook using the "WithIncognitoWarning" story variants for IdentifierForm and IdentifierPage components.

### Embedded Browser Detection

AuthHero automatically detects when users are accessing the login page from within embedded browsers (like in-app browsers in social media apps) and provides appropriate warnings and feature restrictions.

**How it works:**

- Detection happens server-side by analyzing the User-Agent header
- Uses pattern matching to identify ~13 common embedded browsers including:
  - WebView (Android/iOS)
  - Google Search App (GSA)
  - Facebook, Instagram, TikTok, Twitter/X
  - LinkedIn, UC Browser, Samsung Internet
  - Electron, Tauri
- Returns both a boolean flag and the detected browser name
- Browser name is interpolated into user-facing messages via i18next

**Warning Message:**

The warning appears at the top of the login form with:

- 🔄 Icon indicating browser limitation
- "Do you have to keep logging in?" heading
- Personalized message: "You are currently inside the {browserName}. This browser often logs you out, so we recommend using your phone's default browser instead."

**Social Login Restrictions:**

Strategies can opt-in to being disabled in embedded browsers by setting the `disableEmbeddedBrowsers` property:

```typescript
// Example: Google OAuth2 strategy
export const displayName = "Google";
export const disableEmbeddedBrowsers = true; // Hides button in embedded browsers

export const logo: FC<{ className?: string }> = ({ className = "" }) => (
  // ... logo component
);
```

**Strategy Type Definition:**

```typescript
export type Strategy = {
  displayName: string;
  logo: FC<{ className?: string }>;
  getRedirect: (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    connection: Connection,
  ) => Promise<{ redirectUrl: string; code: string; codeVerifier?: string }>;
  validateAuthorizationCodeAndGetUser: (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    connection: Connection,
    code: string,
    codeVerifier?: string,
  ) => Promise<UserInfo>;
  disableEmbeddedBrowsers?: boolean; // Optional: hide this strategy in embedded browsers
};
```

**Implementation:**

```typescript
// Server-side: Detect embedded browser from User-Agent
const userAgent = ctx.req.header("user-agent");
const detector = new DefaultUserAgentDetector();
const { isEmbedded, browserName } = detector.detectEmbedded(userAgent);

// Pass to component
<IdentifierPage
  isEmbedded={isEmbedded}
  browserName={browserName}
  // ... other props
/>

// Component: Filter out disabled strategies
const socialConnections = connections
  .map((strategyName) => {
    const strategy = getSocialStrategy(strategyName);
    return strategy ? { name: strategyName, ...strategy } : null;
  })
  .filter((config): config is NonNullable<typeof config> => config !== null)
  .filter((config) => {
    // Filter out strategies that are disabled for embedded browsers
    if (isEmbedded && config.disableEmbeddedBrowsers) {
      return false;
    }
    return true;
  });
```

**Detected Browsers:**

The following embedded browsers are currently detected:

- **WebView**: Generic Android/iOS WebView
- **Google Search App (GSA)**: Google's in-app browser
- **Facebook**: Facebook in-app browser
- **Instagram**: Instagram in-app browser
- **TikTok**: TikTok in-app browser
- **Twitter/X**: Twitter/X in-app browser
- **LinkedIn**: LinkedIn in-app browser
- **UC Browser**: UC Browser app
- **Samsung Internet**: Samsung's browser app
- **Electron**: Electron-based desktop apps
- **Tauri**: Tauri-based desktop apps

**Custom Implementation:**

You can provide your own user agent detection by implementing the `UserAgentDetector` interface:

```typescript
export interface UserAgentDetector {
  detectEmbedded(userAgent?: string): UserAgentInfo;
}

export interface UserAgentInfo {
  isEmbedded: boolean;
  browser?: {
    name?: string;
  };
}
```

**Features:**

- ✅ Server-side detection (no client-side JavaScript required)
- ✅ Personalized browser name in warning messages
- ✅ Strategy-level control over availability in embedded browsers
- ✅ Graceful fallback if User-Agent not available
- ✅ Works in both classic and shadcn UI styles
- ✅ Full internationalization support with i18next variable interpolation

**Why Disable Social Login in Embedded Browsers?**

Many social login providers (especially Google) have issues in embedded browsers due to:

- Cookie handling restrictions
- Redirect chain complications
- Security policies that block third-party authentication flows
- Users frequently being logged out due to session storage limitations

By disabling problematic social login options and showing a clear warning, you provide a better user experience and reduce support requests.

## Next Steps

- [Explore components in Storybook](/storybook/index.html)
- [View API Reference](/api/overview)
- [See authentication flow guide](/guides/authentication-flow)
