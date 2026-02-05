---
title: API Reference
description: Screen configuration and component reference for the AuthHero UI Widget
---

# API Reference

Complete reference for screen configuration and supported components.

## Screen Configuration

The widget renders screens based on the Auth0 Forms API schema:

```typescript
interface UIScreen {
  title?: string;
  description?: string;
  components: UIComponent[];
  messages?: Message[];
  branding?: Branding;
  theme?: string;
}

interface UIComponent {
  component: string; // e.g., 'text-input', 'submit-button', 'social-button-group'
  id: string;
  label?: string;
  [key: string]: any; // Component-specific props
}
```

## Supported Components

The widget supports [27+ Auth0 component types](https://auth0.com/docs/authenticate/login/auth0-universal-login/new-experience/universal-login-page-templates):

- `heading` - Page headings
- `description` - Descriptive text
- `text-input` - Text, email, phone inputs
- `password-input` - Password field with show/hide
- `checkbox-input` - Checkboxes
- `select-input` - Dropdown selects
- `submit-button` - Primary action buttons
- `button` - Secondary action buttons
- `social-button-group` - Social login buttons
- `anchor` - Links and navigation
- `separator` - Visual dividers
- `image` - Logos and images
- And more...

## Best Practices

### Security

- Always validate user input on the server
- Use HTTPS for all API requests
- Implement CSRF protection for hosted pages
- Never expose sensitive data in screen configurations
- Validate the `state` parameter to prevent session fixation

### Performance

- Use SSR for hosted pages to improve initial load time
- Lazy load the widget in SPAs if not immediately needed
- Cache branding and theme configurations
- Minimize screen transitions by combining related inputs

### User Experience

- Provide clear error messages from the server
- Show loading states during submissions
- Preserve form data when navigating between screens
- Support browser back/forward navigation
- Use appropriate `autocomplete` attributes

### Development

- Use the event-based pattern for better testability
- Handle errors gracefully and show user-friendly messages
- Log events for debugging and analytics
- Test with different screen configurations
- Validate screen schemas on the server

## Troubleshooting

### Widget Not Rendering

- Check that the script is loaded: `<script type="module" src="/widget/authhero-widget.esm.js"></script>`
- Verify the `screen` prop is valid JSON
- Check browser console for errors
- Ensure the widget is a child of `<body>` or a rendered element

### Form Not Submitting

- Verify `formSubmit` event listener is attached
- Check network tab for failed API requests
- Ensure the `state` parameter is valid and not expired
- Verify CORS settings if calling from a different domain

### Branding Not Applied

- Check that `branding` prop is valid JSON
- Verify image URLs are accessible
- Check CSS custom properties are not being overridden
- Inspect element to see computed styles

## Examples

See the [demo app](/apps/demo/) for complete working examples of all integration patterns.

## Further Reading

- [Universal Login Flows](/api/flows) - Complete flow documentation
- [Auth0 Forms API](/api/forms) - Forms API reference
- [StencilJS Documentation](https://stenciljs.com/) - Web component framework
