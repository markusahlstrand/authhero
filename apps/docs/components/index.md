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
  <a href="/storybook/" target="_blank" style="display: inline-block; padding: 0.75rem 1.5rem; background: #3B82F6; color: white; border-radius: 0.5rem; text-decoration: none; font-weight: 600;">
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
  client 
});
// html is a string ready to be sent to the client
```

## Next Steps

- [Explore components in Storybook](/storybook/)
- [View API Reference](/api/overview)
- [See authentication flow guide](/guides/authentication-flow)
