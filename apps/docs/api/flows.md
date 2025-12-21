# Flows in AuthHero

Flows in AuthHero provide a powerful way to orchestrate complex authentication and user management workflows. Unlike forms which focus on UI presentation, flows handle the business logic and actions that need to be performed during authentication processes.

## Overview

A flow consists of a sequence of actions that are executed in order. Flows can be triggered through:

- Post-login hooks
- Post-registration hooks
- Manual API calls
- Form node navigation

## Flow Structure

A basic flow has the following structure:

```json
{
  "id": "flow_abc123",
  "name": "Email Verification Flow",
  "actions": [
    {
      "id": "verify_email",
      "type": "EMAIL",
      "action": "VERIFY_EMAIL",
      "params": {
        "email": "{{user.email}}",
        "rules": {
          "require_mx_record": true,
          "block_disposable_emails": true
        }
      },
      "allow_failure": false,
      "mask_output": false
    }
  ],
  "created_at": "2024-12-21T10:00:00.000Z",
  "updated_at": "2024-12-21T10:00:00.000Z"
}
```

## Action Types

Flows support multiple action types for different purposes:

### AUTH0 Actions

Auth0-compatible actions for user management:

#### UPDATE_USER

Updates user attributes:

```json
{
  "id": "update_metadata",
  "type": "AUTH0",
  "action": "UPDATE_USER",
  "params": {
    "user_id": "{{user.user_id}}",
    "changes": {
      "app_metadata": {
        "onboarded": true
      }
    }
  }
}
```

#### CREATE_USER

Creates a new user (typically used in migration scenarios):

```json
{
  "id": "create_user",
  "type": "AUTH0",
  "action": "CREATE_USER",
  "params": {
    "email": "user@example.com",
    "password": "secure_password",
    "connection_id": "con_123"
  }
}
```

#### GET_USER

Retrieves user information:

```json
{
  "id": "get_user",
  "type": "AUTH0",
  "action": "GET_USER",
  "params": {
    "user_id": "auth0|123456"
  }
}
```

#### SEND_EMAIL

Sends an email to the user:

```json
{
  "id": "send_welcome_email",
  "type": "AUTH0",
  "action": "SEND_EMAIL",
  "params": {
    "to": "{{user.email}}",
    "subject": "Welcome!",
    "template": "welcome_email"
  }
}
```

### EMAIL Actions

Email-specific validation and verification:

#### VERIFY_EMAIL

Validates email addresses with configurable rules:

```json
{
  "id": "verify_email",
  "type": "EMAIL",
  "action": "VERIFY_EMAIL",
  "params": {
    "email": "{{user.email}}",
    "rules": {
      "require_mx_record": true,
      "block_aliases": false,
      "block_free_emails": false,
      "block_disposable_emails": true,
      "blocklist": ["spam.com", "test.com"],
      "allowlist": ["company.com"]
    }
  }
}
```

**Validation Rules:**

- `require_mx_record`: Verify the domain has valid MX records
- `block_aliases`: Block email addresses with + aliases (e.g., user+test@example.com)
- `block_free_emails`: Block common free email providers (Gmail, Yahoo, etc.)
- `block_disposable_emails`: Block temporary/disposable email services
- `blocklist`: Array of domains to block
- `allowlist`: Array of domains to explicitly allow (overrides other rules)

### REDIRECT Actions

**AuthHero-specific feature** for redirecting users during authentication flows:

#### REDIRECT_USER

Redirects the user to a predefined or custom URL while maintaining the authentication session state:

```json
{
  "id": "redirect_to_email_change",
  "type": "REDIRECT",
  "action": "REDIRECT_USER",
  "params": {
    "target": "change-email"
  }
}
```

**Pre-defined Targets:**

- `change-email`: Redirects to `/u/account/change-email?state=...`
- `account`: Redirects to `/u/account?state=...`
- `custom`: Redirects to a custom URL (requires `custom_url` parameter)

**Custom URL Example:**

```json
{
  "id": "redirect_to_onboarding",
  "type": "REDIRECT",
  "action": "REDIRECT_USER",
  "params": {
    "target": "custom",
    "custom_url": "/onboarding/welcome"
  }
}
```

**State Preservation:**

The redirect action automatically appends the authentication state to the redirect URL, ensuring the user can continue their authentication flow after completing the redirected action. For example:

- Pre-defined targets automatically include `?state={loginSessionId}`
- Custom URLs get the state appended: `/onboarding/welcome?state={loginSessionId}`

This is particularly useful for:

- Forcing email changes for users with invalid email patterns
- Requiring profile completion before authentication
- Conditional onboarding based on user attributes
- Custom consent flows

## Action Parameters

### Common Parameters

All actions support these common parameters:

- `id` (required): Unique identifier for the action step
- `alias` (optional): Human-readable name for the action (max 100 characters)
- `type` (required): The action type (`AUTH0`, `EMAIL`, or `REDIRECT`)
- `action` (required): The specific action to perform
- `allow_failure` (optional): If `true`, the flow continues even if this action fails
- `mask_output` (optional): If `true`, the action output is not logged (useful for sensitive data)

### Template Variables

Many action parameters support template variables using the `{{variable}}` syntax:

- `{{user.email}}`: User's email address
- `{{user.user_id}}`: User's unique ID
- `{{user.name}}`: User's display name
- `{{user.app_metadata.field}}`: Custom app metadata fields
- `{{user.user_metadata.field}}`: Custom user metadata fields

## Flow Execution

### Execution Order

Actions are executed sequentially in the order they appear in the `actions` array. Each action must complete before the next one starts.

### Error Handling

By default, if an action fails, the entire flow stops and returns an error. You can change this behavior with:

```json
{
  "id": "optional_action",
  "type": "EMAIL",
  "action": "VERIFY_EMAIL",
  "allow_failure": true,
  "params": { ... }
}
```

When `allow_failure: true`, the flow continues to the next action even if this one fails.

### Output Masking

Sensitive data can be masked from logs:

```json
{
  "id": "sensitive_update",
  "type": "AUTH0",
  "action": "UPDATE_USER",
  "mask_output": true,
  "params": { ... }
}
```

This prevents the action's output from appearing in execution logs.

## Using Flows with Forms

Flows can be integrated with forms through ACTION nodes. This allows forms to trigger redirects or other actions based on conditional routing:

```json
{
  "nodes": [
    {
      "id": "check_email",
      "type": "ROUTER",
      "config": {
        "rules": [
          {
            "id": "invalid_email_rule",
            "condition": {
              "operator": "ends_with",
              "field": "{{context.user.email}}",
              "value": "@oldcompany.com"
            },
            "next_node": "redirect_to_change_email"
          }
        ],
        "fallback": "continue_flow"
      }
    },
    {
      "id": "redirect_to_change_email",
      "type": "ACTION",
      "config": {
        "action_type": "REDIRECT",
        "target": "change-email",
        "next_node": "$ending"
      }
    }
  ]
}
```

In this example:

1. A ROUTER node checks the user's email
2. If it ends with `@oldcompany.com`, it routes to an ACTION node
3. The ACTION node redirects the user to the change-email page
4. The state is preserved, allowing the user to continue after changing their email

## API Endpoints

Flows can be managed through the Management API:

### List Flows

```http
GET /api/v2/flows
Authorization: Bearer {access_token}
```

### Get Flow

```http
GET /api/v2/flows/{flow_id}
Authorization: Bearer {access_token}
```

### Create Flow

```http
POST /api/v2/flows
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "name": "My Flow",
  "actions": [...]
}
```

### Update Flow

```http
PATCH /api/v2/flows/{flow_id}
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "name": "Updated Flow Name",
  "actions": [...]
}
```

### Delete Flow

```http
DELETE /api/v2/flows/{flow_id}
Authorization: Bearer {access_token}
```

## Best Practices

### 1. Use Descriptive Names and Aliases

```json
{
  "name": "Post-Login Email Verification",
  "actions": [
    {
      "id": "verify_email_step",
      "alias": "Verify user email is valid",
      "type": "EMAIL",
      "action": "VERIFY_EMAIL"
    }
  ]
}
```

### 2. Handle Failures Gracefully

Consider which actions are critical and which can fail:

```json
{
  "actions": [
    {
      "id": "verify_email",
      "type": "EMAIL",
      "action": "VERIFY_EMAIL",
      "allow_failure": false // Critical
    },
    {
      "id": "send_analytics",
      "type": "AUTH0",
      "action": "SEND_REQUEST",
      "allow_failure": true // Non-critical
    }
  ]
}
```

### 3. Mask Sensitive Data

Always mask sensitive information in action outputs:

```json
{
  "id": "update_password",
  "type": "AUTH0",
  "action": "UPDATE_USER",
  "mask_output": true,
  "params": {
    "user_id": "{{user.user_id}}",
    "changes": {
      "password": "new_password"
    }
  }
}
```

### 4. Use Template Variables

Leverage template variables for dynamic values:

```json
{
  "params": {
    "email": "{{user.email}}",
    "name": "{{user.name}}",
    "custom_field": "{{user.app_metadata.custom_field}}"
  }
}
```

### 5. Keep Flows Focused

Create separate flows for different purposes rather than one large flow:

- ✅ "Email Verification Flow"
- ✅ "User Onboarding Flow"
- ✅ "Profile Update Flow"
- ❌ "Everything Flow"

## Comparison with Auth0 Actions

| Feature                | Auth0 Actions                 | AuthHero Flows               |
| ---------------------- | ----------------------------- | ---------------------------- |
| **Configuration**      | Code-based (Node.js)          | JSON configuration           |
| **Execution**          | Serverless functions          | Built-in execution engine    |
| **Email Validation**   | Custom implementation         | Built-in EMAIL actions       |
| **Redirects**          | Limited                       | Full REDIRECT action support |
| **Template Variables** | Limited                       | Extensive support            |
| **Testing**            | Complex (separate deployment) | Simple (API-based)           |

## Examples

### Example 1: Email Validation Flow

```json
{
  "name": "Validate Corporate Email",
  "actions": [
    {
      "id": "verify_email",
      "alias": "Ensure email is from company domain",
      "type": "EMAIL",
      "action": "VERIFY_EMAIL",
      "params": {
        "email": "{{user.email}}",
        "rules": {
          "allowlist": ["company.com"],
          "require_mx_record": true
        }
      },
      "allow_failure": false
    }
  ]
}
```

### Example 2: Conditional Redirect Flow

```json
{
  "name": "Force Email Update for Legacy Users",
  "actions": [
    {
      "id": "redirect_legacy_users",
      "alias": "Redirect users with old email pattern",
      "type": "REDIRECT",
      "action": "REDIRECT_USER",
      "params": {
        "target": "change-email"
      }
    }
  ]
}
```

This flow would typically be used with a form ROUTER that checks email patterns first.

### Example 3: User Onboarding Flow

```json
{
  "name": "New User Onboarding",
  "actions": [
    {
      "id": "set_metadata",
      "alias": "Mark user as new",
      "type": "AUTH0",
      "action": "UPDATE_USER",
      "params": {
        "user_id": "{{user.user_id}}",
        "changes": {
          "app_metadata": {
            "onboarded": false,
            "created_at": "{{timestamp}}"
          }
        }
      }
    },
    {
      "id": "redirect_onboarding",
      "alias": "Send to onboarding",
      "type": "REDIRECT",
      "action": "REDIRECT_USER",
      "params": {
        "target": "custom",
        "custom_url": "/onboarding"
      }
    }
  ]
}
```

## See Also

- [Forms Documentation](./forms.md) - UI-focused form system
- [Hooks Documentation](../auth0-comparison/hooks.md) - Programmatic hooks
- [API Reference](./endpoints.md) - Complete API documentation
