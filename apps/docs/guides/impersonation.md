---
title: Impersonation Guide
description: Implement user impersonation in AuthHero for administrators and support staff. Config-based hooks with users:impersonate permission.
---

# Impersonation Guide

## Overview

The impersonation functionality allows users with the `users:impersonate` permission to impersonate other users during the login flow. This is useful for administrators and support staff who need to test user experiences or troubleshoot issues.

AuthHero supports impersonation through **config-based hooks** that are Auth0-compatible and can be configured directly in your application code.

## Configuration Methods

### Method 1: Config-Based Hooks (Recommended)

Configure impersonation hooks directly when initializing your AuthHero application:

```typescript
import { init } from "@authhero/authhero";

const authHero = init({
  dataAdapter: myAdapter,
  hooks: {
    onExecutePostLogin: async (event, api) => {
      // Check if user has impersonation permissions
      const userPermissions = await event.ctx.env.data.userPermissions.list(
        event.client.tenant.id,
        event.user.user_id,
      );

      const hasImpersonationPermission = userPermissions.some(
        (perm) => perm.permission_name === "users:impersonate",
      );

      if (hasImpersonationPermission) {
        // Redirect to impersonation page
        api.redirect.sendUserTo("/u/impersonate", {
          query: {
            source: "post-login-hook",
            user_id: event.user.user_id,
          },
        });
      }
    },
  },
});
```

### Method 2: Environment-Based Hooks (Legacy)

You can also configure hooks through environment bindings:

```typescript
const env = {
  data: myAdapter,
  hooks: {
    onExecutePostLogin: async (event, api) => {
      // Same impersonation logic as above
    },
  },
};
```

### Method 3: Database Page Hooks (Legacy)

Create a post-user-login hook in the database:

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

## Auth0-Compatible API

AuthHero's impersonation hooks are fully compatible with Auth0's Actions API pattern. The `api.redirect.sendUserTo()` method provides Auth0-compatible redirect functionality:

```typescript
// Auth0-compatible redirect with query parameters
api.redirect.sendUserTo("/u/impersonate", {
  query: {
    user_id: event.user.user_id,
    source: "admin-panel",
  },
});

// Token encoding for secure state management
const impersonationToken = api.redirect.encodeToken({
  secret: "your-secret-key",
  payload: {
    original_user_id: event.user.user_id,
    timestamp: Date.now(),
    action: "impersonate",
  },
  expiresInSeconds: 300, // 5 minutes
});

// Token validation
const tokenData = api.redirect.validateToken({
  secret: "your-secret-key",
  tokenParameterName: "token",
});
```

## Hook Properties (Database Hooks)

For database-based hooks, configure the following properties:

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

## Advanced Impersonation Patterns

### Conditional Impersonation

```typescript
onExecutePostLogin: async (event, api) => {
  const { user, client, scope } = event;

  // Only allow impersonation for admin applications
  const adminClients = ["admin_dashboard", "support_panel"];
  if (!adminClients.includes(client.client_id)) {
    return; // Skip impersonation for regular apps
  }

  // Check multiple permission patterns
  const userPermissions = await event.ctx.env.data.userPermissions.list(
    client.tenant.id,
    user.user_id,
  );

  const canImpersonate = userPermissions.some(
    (perm) =>
      perm.permission_name === "users:impersonate" ||
      perm.permission_name === "admin:full_access",
  );

  if (canImpersonate) {
    api.redirect.sendUserTo("/u/impersonate", {
      query: {
        role: user.app_metadata?.role,
        department: user.user_metadata?.department,
      },
    });
  }
};
```

### Impersonation with Time-Based Tokens

```typescript
onExecutePostLogin: async (event, api) => {
  if (hasImpersonationPermission(event.user)) {
    // Create a secure token for the impersonation session
    const sessionToken = api.redirect.encodeToken({
      secret: process.env.IMPERSONATION_SECRET,
      payload: {
        original_user_id: event.user.user_id,
        session_id: event.ctx.var.loginSession?.id,
        initiated_at: Date.now(),
        client_id: event.client.client_id,
      },
      expiresInSeconds: 900, // 15 minutes
    });

    api.redirect.sendUserTo("/u/impersonate", {
      query: {
        token: sessionToken,
        return_to: event.request.query?.redirect_uri || "/dashboard",
      },
    });
  }
};
```

### Role-Based Impersonation Restrictions

```typescript
onExecutePostLogin: async (event, api) => {
  const userRole = event.user.app_metadata?.role;

  // Different impersonation rules based on role
  switch (userRole) {
    case "super_admin":
      // Super admins can impersonate anyone
      if (hasPermission(event.user, "users:impersonate")) {
        api.redirect.sendUserTo("/u/impersonate");
      }
      break;

    case "support_agent":
      // Support agents can only impersonate regular users
      api.redirect.sendUserTo("/u/impersonate", {
        query: {
          allowed_roles: "user,customer",
          restricted: "true",
        },
      });
      break;

    case "department_admin":
      // Department admins can impersonate within their department
      const department = event.user.user_metadata?.department;
      api.redirect.sendUserTo("/u/impersonate", {
        query: {
          department_filter: department,
          scope: "department_only",
        },
      });
      break;

    default:
      // Regular users cannot impersonate
      break;
  }
};
```

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
