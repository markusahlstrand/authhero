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

## Next Steps

- [Explore components in Storybook](/storybook/index.html)
- [View API Reference](/api/overview)
- [See authentication flow guide](/guides/authentication-flow)
