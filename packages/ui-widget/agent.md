# Agent Instructions for UI Widget

## Core Principles

### 1. Ory Kratos Compatibility

This widget is designed to be **as close to Ory Kratos UI Node schema as possible**.

### 2. Pure UI - No Auth Logic

The widget is **pure presentation**. It:
- Renders forms based on JSON schema
- Emits generic events (`formSubmit`, `buttonClick`, `nodeChange`)
- Does NOT contain auth-specific logic (no "social login", "MFA", etc.)

The consuming application interprets events based on context:

```typescript
// In your app, NOT in the widget:
widget.addEventListener('buttonClick', (e) => {
  const { group, name, value } = e.detail;
  
  if (group === 'oidc') {
    // Redirect to social provider
    window.location.href = `/api/auth/social/${value}`;
  }
});
```

When making changes to this package:

1. **Reference Ory Kratos documentation first**: https://www.ory.sh/docs/kratos/concepts/ui-user-interface
2. **Use Ory's naming conventions** for node types, attributes, and groups
3. **Keep presentation logic out of the JSON** - styling decisions belong in CSS/widget props, not the data model
4. **Messages are arrays**, not objects - follow Ory's pattern for validation errors and hints
5. **No auth-specific naming** - use generic names like `buttonClick`, not `socialLogin`

## Key Ory Kratos Patterns We Follow

### Node Types (Ory-compatible)
- `input` - Form inputs (text, email, password, checkbox, hidden, submit, button)
- `img` - Images
- `a` - Anchor/links
- `text` - Text content
- `script` - Scripts (rarely used)

**NOT:** `button`, `social-button`, `divider`, `image`, `link` - these are legacy types.

### Node Groups (Ory-compatible)
- `default` - Default form fields
- `identifier_first` - Identifier-first flow fields (AuthHero extension)
- `password` - Password-related fields
- `oidc` - Social/OAuth providers (buttons are `input[type=submit]` with `group=oidc`)
- `totp` - TOTP MFA
- `webauthn` - WebAuthn/passkeys
- `lookup_secret` - Backup codes
- `profile` - Profile fields
- `link` - Passwordless/magic link fields

### Attribute Structure (Ory-compatible)
```typescript
interface UiNodeInputAttributes {
  node_type: "input";        // Discriminator
  name: string;              // Form field name
  type: "text" | "email" | "password" | "submit" | "hidden" | "checkbox" | "button";
  value?: string | number | boolean;
  required?: boolean;
  disabled?: boolean;
  autocomplete?: string;
  pattern?: string;
  maxlength?: number;
}
```

### Label Structure (Ory-compatible)
```typescript
interface UiNodeMeta {
  label?: {
    id?: number;    // i18n message ID
    text: string;   // Display text
    type: "info" | "error" | "success";
  };
}
```

### Messages Structure (Ory-compatible)
Messages are **arrays**, not objects:
```typescript
messages: Array<{
  id?: number;
  text: string;
  type: "info" | "error" | "success";
  context?: Record<string, unknown>;
}>
```

## AuthHero Extensions

These extend Ory's schema for features not covered by Kratos:

### UiScreen.ui (Extension)
```typescript
interface UiScreen extends UiContainer {
  id: string;
  title?: string;
  ui?: {
    branding?: {
      logo_url?: string;
      primary_color?: string;
      background_color?: string;
    };
    links?: Array<{
      id: string;
      text: string;
      href: string;
      link_text?: string;
    }>;
  };
}
```

### identifier_first Group (Extension)
Ory Kratos uses `default` for identifier-first flows. We added `identifier_first` for explicit distinction.

## How Social Buttons Work

Ory represents social login buttons as `input[type=submit]` with `group=oidc`:
```json
{
  "type": "input",
  "group": "oidc",
  "attributes": {
    "node_type": "input",
    "name": "provider",
    "type": "submit",
    "value": "google"
  },
  "meta": {
    "label": { "text": "Continue with Google", "type": "info" }
  }
}
```

The widget detects `group=oidc` + `type=submit` and renders these as social-style buttons.

## How Dividers Work

Ory doesn't have explicit dividers. The widget automatically inserts an "OR" divider between `oidc` group nodes and `password`/`identifier_first` group nodes when both are present.

## Server Helpers (Legacy)

The `src/server/index.ts` helpers currently use the **legacy schema**. These need to be updated to generate Ory-compatible JSON. Until then, prefer writing JSON directly or using the new type definitions.

## Resources

- [Ory Kratos UI Reference](https://www.ory.sh/docs/kratos/concepts/ui-user-interface)
- [Ory Kratos API Reference](https://www.ory.sh/docs/kratos/reference/api)
- [Ory Elements (React components)](https://github.com/ory/elements)
- [Ory Kratos Self-Service Flows](https://www.ory.sh/docs/kratos/self-service)
