# Forms in AuthHero

This document explains how forms work in AuthHero, including the form structure, component types, and implementation details.

## Form Architecture

AuthHero uses a flexible, flow-based form system that allows for complex user journeys. Forms are constructed using a node-based architecture where each node represents a step in the form flow. This design allows for branching paths, conditional logic, and integration with other flows.

## Form Structure

A form in AuthHero consists of:

- **Nodes**: Individual steps in the form flow (steps, routers, flows)
- **Components**: UI elements within steps (text, inputs, checkboxes, buttons)
- **Start Node**: The entry point of the form flow
- **Ending Node**: The exit point with optional redirections or follow-up actions

### Example Form Structure

```json
{
  "name": "Legal Consent Form",
  "nodes": [
    {
      "id": "step1",
      "type": "STEP",
      "coordinates": { "x": 100, "y": 100 },
      "alias": "Privacy Policy Step",
      "config": {
        "components": [
          {
            "id": "intro-text",
            "type": "RICH_TEXT",
            "config": {
              "content": "<h2>Privacy Policy Update</h2><p>Please review our updated privacy policy.</p>"
            }
          },
          {
            "id": "policy-consent",
            "type": "LEGAL",
            "config": {
              "text": "I agree to the <a href='/privacy'>Privacy Policy</a>"
            },
            "required": true
          },
          {
            "id": "continue-btn",
            "type": "NEXT_BUTTON",
            "config": {
              "text": "Continue"
            }
          }
        ],
        "next_node": "ending"
      }
    }
  ],
  "start": {
    "next_node": "step1"
  },
  "ending": {
    "redirection": {
      "target": "/dashboard"
    }
  }
}
```

## Form Component Types

AuthHero supports various component types for building forms:

### RICH_TEXT Component

Used for displaying formatted text content:

```typescript
{
  "id": "intro-text",
  "type": "RICH_TEXT",
  "config": {
    "content": "<h2>Welcome</h2><p>Please fill out this form.</p>"
  }
}
```

The `content` field accepts HTML markup for rich text formatting.

### LEGAL Component

Used for legal agreements and consent checkboxes:

```typescript
{
  "id": "privacy-consent",
  "type": "LEGAL",
  "config": {
    "text": "I agree to the <a href='/privacy'>Privacy Policy</a>"
  },
  "required": true
}
```

When `required` is set to `true`, the form cannot be submitted unless the checkbox is checked. The component automatically manages the disabled state of the submit button based on checkbox state.

### NEXT_BUTTON Component

Used for form submission and navigation:

```typescript
{
  "id": "submit-btn",
  "type": "NEXT_BUTTON",
  "config": {
    "text": "Continue"
  }
}
```

The button's text can be customized via the `text` property.

## Node Types

### STEP Node

A standard form step containing components:

```typescript
{
  "id": "user-info",
  "type": "STEP",
  "coordinates": { "x": 200, "y": 150 },
  "alias": "User Information",
  "config": {
    "components": [...],
    "next_node": "confirmation-step"
  }
}
```

### FLOW Node

References another flow, allowing for flow composition:

```typescript
{
  "id": "auth-flow",
  "type": "FLOW",
  "coordinates": { "x": 300, "y": 200 },
  "alias": "Authentication",
  "config": {
    "flow_id": "auth-form",
    "next_node": "profile-step"
  }
}
```

### ROUTER Node

Conditionally routes to different nodes based on rules:

```typescript
{
  "id": "route-based-on-role",
  "type": "ROUTER",
  "coordinates": { "x": 400, "y": 250 },
  "alias": "Role Router",
  "config": {
    "rules": [
      {
        "id": "admin-rule",
        "alias": "Admin User",
        "condition": { "field": "role", "operator": "equals", "value": "admin" },
        "next_node": "admin-dashboard"
      }
    ],
    "fallback": ["user-dashboard"]
  }
}
```

### ACTION Node

Performs an action such as redirecting the user. This is particularly useful for conditional redirects based on user attributes:

```typescript
{
  "id": "redirect-to-email-change",
  "type": "ACTION",
  "coordinates": { "x": 500, "y": 300 },
  "alias": "Redirect to Change Email",
  "config": {
    "action_type": "REDIRECT",
    "target": "change-email",
    "next_node": "$ending"
  }
}
```

**Redirect Targets:**

- `change-email`: Redirects to the change email page
- `account`: Redirects to the account settings page
- `custom`: Redirects to a custom URL (requires `custom_url` parameter)

**Example with custom URL:**

```typescript
{
  "id": "redirect-to-onboarding",
  "type": "ACTION",
  "config": {
    "action_type": "REDIRECT",
    "target": "custom",
    "custom_url": "/onboarding/welcome",
    "next_node": "$ending"
  }
}
```

**State Preservation:**

When an ACTION node with REDIRECT is executed, the authentication state (`loginSession.id`) is automatically appended to the redirect URL. This ensures users can continue their authentication flow after completing the redirected action.

**Common Use Cases:**

1. **Force Email Updates**: Redirect users with email addresses matching certain patterns to the change-email page
2. **Conditional Onboarding**: Direct new users to onboarding flows
3. **Profile Completion**: Redirect users with incomplete profiles
4. **Custom Consent**: Direct users to custom consent pages

## Client-Side Behavior

Forms in AuthHero include built-in client-side validations:

### Legal Component Behavior

When a `LEGAL` component with `required: true` is included:

1. The form automatically disables the submit button until the checkbox is checked
2. No JavaScript is required for this behavior, making it work reliably even with server-side rendering

## Form Submission

When a form is submitted:

1. All form data is sent as `application/x-www-form-urlencoded`
2. Checkbox values are included only when checked (standard HTML form behavior)
3. The server validates all `required` fields
4. If validation passes, the flow proceeds to the next node
5. If validation fails, the form is re-rendered with error messages

## API Endpoints

Forms can be accessed and managed through the following API endpoints:

- `GET /api/v2/forms` - List all forms
- `GET /api/v2/forms/{id}` - Get a specific form
- `POST /api/v2/forms` - Create a new form
- `PUT /api/v2/forms/{id}` - Update a form
- `DELETE /api/v2/forms/{id}` - Delete a form

For full API details, see the [endpoints documentation](./endpoints.md).

## Combining Forms with Flows

Forms can work together with flows by using ACTION nodes to trigger redirects or other actions. For example, you can create a form that checks user attributes and conditionally redirects them:

```json
{
  "name": "Email Validation Form",
  "nodes": [
    {
      "id": "start-router",
      "type": "ROUTER",
      "coordinates": { "x": 100, "y": 100 },
      "alias": "Check Email Domain",
      "config": {
        "rules": [
          {
            "id": "old-email-rule",
            "alias": "Old Company Email",
            "condition": {
              "operator": "ends_with",
              "field": "{{context.user.email}}",
              "value": "@oldcompany.com"
            },
            "next_node": "redirect-action"
          }
        ],
        "fallback": "continue-step"
      }
    },
    {
      "id": "redirect-action",
      "type": "ACTION",
      "coordinates": { "x": 200, "y": 150 },
      "alias": "Redirect to Change Email",
      "config": {
        "action_type": "REDIRECT",
        "target": "change-email",
        "next_node": "$ending"
      }
    },
    {
      "id": "continue-step",
      "type": "STEP",
      "coordinates": { "x": 200, "y": 250 },
      "alias": "Welcome Screen",
      "config": {
        "components": [
          {
            "id": "welcome",
            "type": "RICH_TEXT",
            "config": {
              "content": "<h2>Welcome!</h2>"
            }
          },
          {
            "id": "continue-btn",
            "type": "NEXT_BUTTON",
            "config": { "text": "Continue" }
          }
        ],
        "next_node": "$ending"
      }
    }
  ],
  "start": { "next_node": "start-router" },
  "ending": { "resume_flow": true }
}
```

In this example:

1. The form starts with a ROUTER that checks the user's email
2. If the email ends with `@oldcompany.com`, it routes to an ACTION node
3. The ACTION node redirects to the change-email page (with state preserved)
4. Otherwise, it shows a welcome screen

See the [Flows documentation](./flows.md) for more details on flows and actions.

## Form Design Best Practices

- Keep forms as short as possible to improve completion rates
- Group related fields together
- Provide clear error messages
- Use descriptive labels and button text
- Consider mobile-friendly design (all AuthHero forms are responsive by default)
- Test forms with actual users when possible

## Customizing Form Appearance

Form appearance can be customized via the global tenant settings or on a per-form basis using the `style` property:

```json
"style": {
  "css": ".rich-text h2 { color: #4F2D7F; }"
}
```

For more extensive customization, refer to the Custom Styling Guide.
