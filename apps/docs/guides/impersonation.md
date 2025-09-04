# Impersonation Hook Documentation

## Overview

The impersonation hook allows users with the `users:impersonate` permission to impersonate other users during the login flow. This is useful for administrators and support staff who need to test user experiences or troubleshoot issues.

## Configuration

To enable impersonation, create a post-user-login hook with the following configuration:

```json
{
  "id": "hook_impersonate_001",
  "name": "User Impersonation Hook",
  "enabled": true,
  "trigger_id": "post-user-login",
  "page_id": "impersonate",
  "permission_required": "users:impersonate"
}
```

## Hook Properties

- `enabled`: Must be `true` to activate the hook
- `trigger_id`: Must be `"post-user-login"` to run after successful authentication
- `page_id`: Must be `"impersonate"` to redirect to the impersonation page
- `permission_required`: The permission required to access the impersonation page (recommended: `"users:impersonate"`)

## User Permissions

Users who should have access to impersonation must be granted the `users:impersonate` permission. This can be done via:

1. Direct assignment to the user
2. Assignment through a role that the user is assigned to

Example permission assignment:

```json
{
  "resource_server_identifier": "https://your-api.com",
  "permission_name": "users:impersonate"
}
```

## Flow Description

1. User logs in successfully
2. System checks for post-user-login hooks
3. If impersonation hook is found and enabled:
   - System checks if user has the required permission
   - If permission exists, user is redirected to `/u/impersonate?state=<login_session_id>`
   - If no permission, hook is skipped and normal flow continues
4. On the impersonation page:
   - User can continue with their current session
   - User can expand options to impersonate another user by providing their user ID
5. If impersonation is chosen:
   - System validates the target user exists
   - Session is updated to use the target user's identity
   - Authentication flow continues with the impersonated user

## Security Considerations

- Only users with explicit `users:impersonate` permission can access the impersonation functionality
- The impersonation page validates permissions on every request
- Session updates are logged (implementation dependent)
- The original user's session is replaced with the target user's identity

## API Endpoints

The impersonation functionality adds the following endpoints:

- `GET /u/impersonate?state=<state>` - Display impersonation page
- `POST /u/impersonate/continue?state=<state>` - Continue with current user
- `POST /u/impersonate/switch?state=<state>` - Switch to impersonate another user

## Example Use Cases

1. **Customer Support**: Support agents can impersonate customers to troubleshoot issues
2. **Testing**: QA teams can test user experiences without needing separate test accounts
3. **Administration**: Admins can perform actions on behalf of users when needed
