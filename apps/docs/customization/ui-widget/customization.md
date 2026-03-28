---
title: Customization
description: Branding, theming, and CSS styling for the AuthHero UI Widget
---

# Customization

Learn how to customize the appearance and behavior of the widget through branding, theming, and CSS.

## Branding

The widget supports full branding customization:

```typescript
widget.branding = JSON.stringify({
  logoUrl: "https://example.com/logo.png",
  primaryColor: "#6366f1",
  backgroundColor: "#ffffff",
  font: {
    url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap",
  },
});
```

## CSS Custom Properties

Override styles with CSS variables:

```css
authhero-widget {
  --primary-color: #0066cc;
  --background-color: #ffffff;
  --text-color: #333333;
  --border-radius: 8px;
  --font-family: "Inter", sans-serif;
}
```

## Theme Configuration

Advanced theming with component-level customization:

```typescript
widget.theme = JSON.stringify({
  button: {
    primary: {
      backgroundColor: "#6366f1",
      textColor: "#ffffff",
      borderRadius: "8px",
    },
  },
  input: {
    borderColor: "#e5e7eb",
    focusBorderColor: "#6366f1",
  },
});
```

## Styling with CSS Parts

The widget exposes CSS parts that allow you to style internal elements from outside the shadow DOM using the `::part()` pseudo-element.

### Available Parts

| Part                                | Description                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `container`                         | The main widget container                                                                    |
| `header`                            | The header section containing logo, title, and description                                   |
| `logo-wrapper`                      | The wrapper around the logo                                                                  |
| `logo`                              | The logo image                                                                               |
| `title`                             | The screen title (h1)                                                                        |
| `description`                       | The screen description (p)                                                                   |
| `body`                              | The main body containing form fields and buttons                                             |
| `message`                           | Message elements (errors, success)                                                           |
| `message-error`                     | Error message elements                                                                       |
| `message-success`                   | Success message elements                                                                     |
| `social-section`                    | The container for social login buttons                                                       |
| `social-buttons`                    | The wrapper around social buttons                                                            |
| `button-social`                     | All social login buttons                                                                     |
| `button-social-{provider}`          | Provider-specific social button (e.g., `button-social-google-oauth2`, `button-social-vipps`) |
| `button-social-content`             | The text content wrapper inside social buttons                                               |
| `button-social-content-{provider}`  | Provider-specific content wrapper                                                            |
| `button-social-text`                | The main text inside social buttons                                                          |
| `button-social-text-{provider}`     | Provider-specific main text                                                                  |
| `button-social-subtitle`            | Subtitle text element (empty by default, populate via CSS)                                   |
| `button-social-subtitle-{provider}` | Provider-specific subtitle element                                                           |
| `social-icon`                       | All social button icons (img elements)                                                       |
| `social-icon-{provider}`            | Provider-specific icon (e.g., `social-icon-google-oauth2`)                                   |

### Auth0-Compatible Data Attributes

The widget includes data attributes compatible with Auth0's Universal Login for easier migration:

| Attribute                    | Description                       | Example                                  |
| ---------------------------- | --------------------------------- | ---------------------------------------- |
| `data-connection-name`       | Connection name on social buttons | `[data-connection-name="google-oauth2"]` |
| `data-strategy`              | Strategy type on social buttons   | `[data-strategy="google-oauth2"]`        |
| `data-authstack-container`   | Main widget container             | `[data-authstack-container]`             |
| `data-input-name`            | Field name on input elements      | `[data-input-name="password"]`           |
| `data-primary-action-button` | Primary submit/continue button    | `[data-primary-action-button]`           |

::: warning Shadow DOM Limitation
These data attribute selectors only work for CSS **inside** the Shadow DOM (e.g., custom widget themes). For styling from **outside** the Shadow DOM (e.g., in a Universal Login Page Template), use `::part()` selectors instead.
:::

### Basic Part Styling

```css
/* Style the title */
authhero-widget::part(title) {
  font-size: 2rem;
  color: #1a1a1a;
}

/* Style the description */
authhero-widget::part(description) {
  color: #666;
  font-size: 0.9rem;
}

/* Style error messages */
authhero-widget::part(message-error) {
  background-color: #fee2e2;
  border-left: 4px solid #ef4444;
}
```

### Styling Social Login Buttons

You can style individual social login buttons using the provider-specific parts:

```css
/* Add a separator line above a specific social button */
authhero-widget::part(button-social-parat) {
  border-top: 2px solid #ff9500;
  padding-top: 24px;
}

/* Style all social buttons */
authhero-widget::part(button-social) {
  border-radius: 8px;
}

/* Style a specific provider's button */
authhero-widget::part(button-social-google-oauth2) {
  background-color: #f8f9fa;
}
```

### Customizing Social Button Icons

You can hide default icons and replace them with custom ones using CSS:

```css
/* Hide the default icon and add a custom one */
authhero-widget::part(social-icon-google-oauth2) {
  display: none;
}

authhero-widget::part(button-social-google-oauth2)::before {
  content: "";
  display: inline-block;
  width: 20px;
  height: 20px;
  margin-right: 8px;
  background-image: url("https://your-site.com/custom-google-logo.png");
  background-size: contain;
  background-repeat: no-repeat;
}

/* Resize an existing icon */
authhero-widget::part(social-icon-github) {
  width: 24px;
  height: 24px;
}
```

### Adding Subtitles to Social Buttons

Each social button includes an empty subtitle element that you can populate with text using CSS. This is useful for adding secondary text like "Log in with..." translations:

```css
/* Add a subtitle to the Vipps button */
authhero-widget::part(button-social-subtitle-vipps)::before {
  content: "Log in with Vipps";
}

/* Style the subtitle */
authhero-widget::part(button-social-subtitle-vipps) {
  font-style: italic;
  font-size: 0.85em;
  opacity: 0.8;
}
```

For a complete multi-line button layout (e.g., Norwegian text with English subtitle):

```css
/* Make the button layout accommodate two lines */
authhero-widget::part(button-social-vipps) {
  display: flex;
  flex-direction: row;
  align-items: stretch;
}

/* Stack the text vertically */
authhero-widget::part(button-social-content-vipps) {
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}

/* Add the subtitle text */
authhero-widget::part(button-social-subtitle-vipps)::before {
  content: "Log in with Vipps";
}

/* Style the subtitle */
authhero-widget::part(button-social-subtitle-vipps) {
  font-style: italic;
  font-size: 0.85em;
  opacity: 0.8;
  margin-top: 2px;
}

/* Optional: Make the icon fill the button height */
authhero-widget::part(social-icon-vipps) {
  height: 100%;
  width: auto;
  object-fit: contain;
}
```

### Adding Custom Content with ::after

You can add custom text or content after elements using `::after`:

```css
/* Add a welcome message after the title */
authhero-widget::part(title)::after {
  content: "Welcome!";
  display: block;
  font-style: italic;
  font-weight: 300;
  margin-top: 8px;
}

/* Add custom instructions after the description */
authhero-widget::part(description)::after {
  content: "You can log in with your email or a social provider.";
  display: block;
  font-style: italic;
  font-weight: 300;
  margin-top: 8px;
}
```

## Screen-Specific Styling with data-screen

The widget exposes a `data-screen` attribute on the host element that reflects the current screen ID. This allows you to apply different styles based on which screen is being displayed.

### Screen Attribute Selectors

```css
/* Style only the login screen */
authhero-widget[data-screen="login"]::part(title)::after {
  content: "Welcome back!";
  display: block;
  font-style: italic;
  font-weight: 300;
  margin-top: 8px;
}

/* Style only the signup screen */
authhero-widget[data-screen="signup"]::part(title)::after {
  content: "Create your account";
  display: block;
  font-style: italic;
  font-weight: 300;
  margin-top: 8px;
}

/* Style only the forgot-password screen */
authhero-widget[data-screen="forgot-password"]::part(title)::after {
  content: "Don't worry, we'll help you reset it.";
  display: block;
  font-style: italic;
  font-weight: 300;
  margin-top: 8px;
}
```

### Combining Parts and Screen Attributes

You can combine screen-specific selectors with part styling for granular control:

```css
/* Different description styles per screen */
authhero-widget[data-screen="login"]::part(description) {
  color: #4b5563;
}

authhero-widget[data-screen="signup"]::part(description) {
  color: #059669;
}

/* Custom header backgrounds per screen */
authhero-widget[data-screen="login"]::part(header) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem;
  border-radius: 8px 8px 0 0;
}
```

### Practical Example: Multi-Language Support

Use screen-specific styling to add translated helper text:

```css
/* English login screen with Norwegian helper text */
authhero-widget[data-screen="login"]::part(description)::after {
  content: "Som medlem kan du logge inn med enten Vipps eller Google.";
  display: block;
  font-style: italic;
  font-weight: 300;
  margin-top: 8px;
}
```
