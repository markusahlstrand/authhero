# Hooks: AuthHero vs. Auth0

Auth0 made the decision to deprecate its Hooks feature in October 2024, moving towards Actions as the primary way to customize authentication flows. While Actions offer powerful capabilities, AuthHero continues to support a flexible Hooks system that provides distinct advantages, especially for certain use cases.

## AuthHero's Approach to Hooks

AuthHero's Hooks are designed to be a straightforward way to intercept and modify various stages of the authentication and user lifecycle. A key differentiator in AuthHero is the dual nature of its hooks:

1.  **URL Hooks (Web Hooks)**:

    - Similar to traditional webhooks, you can specify a URL that AuthHero will call at a specific trigger point (e.g., "pre-user-signup", "post-user-login").
    - This allows you to execute custom server-side logic, integrate with external systems, or perform data validation by sending a payload to your endpoint.

2.  **Form Hooks**:
    - Unique to AuthHero, you can configure a hook to render a specific Form instead of calling a URL.
    - By specifying a Form ID, AuthHero will present this form to the user at the designated trigger point in the authentication flow.
    - This is particularly powerful for scenarios like progressive profiling, custom consent gathering, or presenting terms of service updates directly within the flow, often without needing to write any backend code for the form interaction itself.

### Available Triggers for URL/Form Hooks

The following trigger points are available for both URL and Form hooks via the Management API:

- `pre-user-signup` - Before a new user is created
- `post-user-registration` - After a new user is successfully created  
- `post-user-login` - After successful authentication

::: info Note on User Deletion and Updates
URL and Form hooks do not currently support user deletion (`pre-user-deletion`, `post-user-deletion`) or user update (`pre-user-update`, `post-user-update`) triggers. However, these events can be handled using **programmatic hooks** (see below) which provide more direct access to the authentication flow.
:::

## Key Differences Summarized

| Feature            | Auth0 (Legacy Hooks) | AuthHero                                        |
| ------------------ | -------------------- | ----------------------------------------------- |
| **Status**         | Deprecated (2024)    | Actively Supported                              |
| **Target Type**    | URL only             | URL (Web Hook) **or** Form ID (Form Hook)       |
| **Use Case Focus** | Custom server logic  | Custom server logic & Codeless form integration |

AuthHero's continued support for Hooks, especially with the addition of Form Hooks, provides a versatile tool for developers looking for both code-based and low-code/no-code customization options within their authentication pipelines.

## Programmatic Hooks in AuthHero

In addition to URL and Form hooks configured through the Management API, AuthHero supports **programmatic hooks** that are defined directly in your application code. These hooks provide powerful server-side customization capabilities and are executed synchronously during various authentication and user lifecycle events.

### Available Programmatic Hooks

AuthHero supports the following programmatic hooks that can be configured when initializing your application:

::: info Note on User Deletion
Currently, AuthHero does not expose a programmatic hook for user deletion (e.g., `onExecutePreUserDeletion` or `onExecutePostUserDeletion`). User deletions are logged automatically by the system. If you need to perform actions before or after user deletion, you can implement this logic in your application layer before calling the Management API's delete user endpoint.
:::

### Hook Availability Comparison

| Event/Trigger | URL/Form Hooks (Management API) | Programmatic Hooks (Config) |
|--------------|----------------------------------|------------------------------|
| Pre User Signup | ✅ `pre-user-signup` | ✅ `onExecutePreUserRegistration` |
| Post User Registration | ✅ `post-user-registration` | ✅ `onExecutePostUserRegistration` |
| Post User Login | ✅ `post-user-login` | ✅ `onExecutePostLogin` |
| Pre User Update | ❌ Not Available | ✅ `onExecutePreUserUpdate` |
| Credentials Exchange | ❌ Not Available | ✅ `onExecuteCredentialsExchange` |
| User Deletion | ❌ Not Available | ❌ Not Available |

**Note:** Programmatic hooks provide more direct access to the authentication flow and are executed synchronously within your application. URL/Form hooks are configured via the Management API and can be modified without code changes.

#### 1. `onExecuteCredentialsExchange`

Triggered during the credentials exchange process (e.g., when exchanging an authorization code for tokens).

**Event Data:**

- `ctx`: Hono context object
- `client`: The client application
- `user`: The authenticated user
- `request`: Request details (IP, user agent, method, URL)
- `scope`: Requested scopes
- `grant_type`: The grant type being used
- `audience`: Optional audience parameter

**API Methods:**

- `accessToken.setCustomClaim(claim, value)`: Add custom claims to the access token
- `idToken.setCustomClaim(claim, value)`: Add custom claims to the ID token
- `access.deny(code, reason?)`: Deny the credentials exchange

#### 2. `onExecutePreUserRegistration`

Triggered before a new user is created in the system.

**Event Data:**

- `ctx`: Hono context object
- `user`: The user object being created
- `request`: Request details (IP, user agent, method, URL)

**API Methods:**

- `user.setUserMetadata(key, value)`: Add or modify user metadata

#### 3. `onExecutePostUserRegistration`

Triggered after a user has been successfully created.

**Event Data:**

- `ctx`: Hono context object
- `user`: The created user object
- `request`: Request details (IP, user agent, method, URL)

**API Methods:**

- `user`: Empty object for future extensibility

#### 4. `onExecutePreUserUpdate`

Triggered before any user update operation.

**Event Data:**

- `ctx`: Hono context object
- `user_id`: The ID of the user being updated
- `updates`: The partial user object with fields being updated
- `request`: Request details (IP, user agent, method, URL)

**API Methods:**

- `user.setUserMetadata(key, value)`: Modify the update data
- `cancel()`: Cancel the update operation

#### 5. `onExecutePostLogin`

Triggered after successful user authentication. This hook is fully compatible with Auth0's Actions API and supports redirect functionality.

**Event Data:**

- `ctx`: Hono context object
- `client`: The client application
- `user`: The authenticated user
- `request`: Request details (IP, user agent, method, URL)
- `scope`: Requested scopes
- `grant_type`: The grant type used

**API Methods:**

- `prompt.render(formId)`: Render a specific form to the user
- `redirect.sendUserTo(url, options?)`: Redirect user to a specific URL (Auth0-compatible)
- `redirect.encodeToken(options)`: Create a secure token for state management
- `redirect.validateToken(options)`: Validate a token from the request

### Configuring Programmatic Hooks

AuthHero supports two ways to configure hooks:

#### Method 1: Config-Based Hooks (Recommended)

Configure hooks directly when initializing your AuthHero application:

```typescript
import { init } from "@authhero/authhero";

const authHero = init({
  dataAdapter: myAdapter,
  hooks: {
    onExecutePreUserRegistration: async (event, api) => {
      // Add custom user metadata during registration
      api.user.setUserMetadata("signup_source", "web");
      api.user.setUserMetadata("onboarding_completed", false);
    },

    onExecutePostLogin: async (event, api) => {
      // Auth0-compatible redirect functionality
      if (event.user?.user_metadata?.requires_setup) {
        api.redirect.sendUserTo("/setup", {
          query: {
            user_id: event.user.user_id,
            step: "profile",
          },
        });
      }
    },
  },
});
```

#### Method 2: Environment-Based Hooks (Legacy)

You can also provide hooks through the environment bindings:

```typescript
import { init } from "@authhero/authhero";
import { createAdapters } from "@authhero/your-adapter";

const env = {
  data: createAdapters(/* your database config */),
  hooks: {
    onExecutePreUserRegistration: async (event, api) => {
      // Add custom user metadata during registration
      api.user.setUserMetadata("signup_source", "web");
      api.user.setUserMetadata("onboarding_completed", false);

      // You can access request details
      console.log(`New user registering from IP: ${event.request.ip}`);
    },

    onExecutePreUserUpdate: async (event, api) => {
      // Validate user updates
      if (event.updates.email && !isValidEmail(event.updates.email)) {
        api.cancel(); // Cancel the update
        return;
      }

      // Add audit metadata
      api.user.setUserMetadata("last_updated_by", "system");
      api.user.setUserMetadata("last_updated_at", new Date().toISOString());
    },

    onExecuteCredentialsExchange: async (event, api) => {
      // Add custom claims to tokens
      api.accessToken.setCustomClaim("tenant_id", event.user?.tenant_id);
      api.idToken.setCustomClaim("role", event.user?.app_metadata?.role);

      // Conditional access control
      if (event.user?.blocked) {
        api.access.deny("access_denied", "User account is blocked");
      }
    },

    onExecutePostUserRegistration: async (event, api) => {
      // Trigger external systems after user creation
      await sendWelcomeEmail(event.user.email);
      await createUserInCRM(event.user);
    },

    onExecutePostLogin: async (event, api) => {
      // Auth0-compatible redirect functionality
      if (event.user?.requires_mfa_setup) {
        api.redirect.sendUserTo("/mfa/setup", {
          query: {
            user_id: event.user.user_id,
            return_to: "/dashboard",
          },
        });
      }

      // Or render a form within the authentication flow
      if (event.user?.requires_terms_acceptance) {
        api.prompt.render("terms-acceptance-form");
      }
    },
  },
  // Other environment configuration...
  ISSUER: "https://your-domain.com",
  JWKS_URL: "https://your-domain.com/.well-known/jwks.json",
  // ...
};

const { authenticationApp, managementApp } = init({
  dataAdapter: env.data,
});

// Use the apps with your framework (Hono, etc.)
```

## Auth0-Compatible Redirect API

AuthHero's `onExecutePostLogin` hook provides an Auth0-compatible redirect API that allows you to redirect users during the authentication flow:

### Basic Redirect

```typescript
onExecutePostLogin: async (event, api) => {
  // Simple redirect
  api.redirect.sendUserTo("/custom-page");

  // Redirect with query parameters
  api.redirect.sendUserTo("/setup", {
    query: {
      user_id: event.user.user_id,
      source: "login",
      step: "profile",
    },
  });
};
```

### Secure Token Management

```typescript
onExecutePostLogin: async (event, api) => {
  // Create a secure token for state management
  const setupToken = api.redirect.encodeToken({
    secret: "your-secret-key",
    payload: {
      user_id: event.user.user_id,
      action: "profile_setup",
      timestamp: Date.now(),
    },
    expiresInSeconds: 600, // 10 minutes
  });

  // Include token in redirect
  api.redirect.sendUserTo("/setup", {
    query: {
      token: setupToken,
    },
  });
};

// Later, validate the token in your application
onExecutePostLogin: async (event, api) => {
  const tokenData = api.redirect.validateToken({
    secret: "your-secret-key",
    tokenParameterName: "token", // Query param name to look for
  });

  if (tokenData && tokenData.payload.action === "profile_setup") {
    // Token is valid, continue with setup
    api.redirect.sendUserTo("/setup/step-2");
  }
};
```

### Real-World Use Cases

#### Progressive Profiling

```typescript
onExecutePostLogin: async (event, api) => {
  const { user } = event;

  // Check if user needs to complete profile
  if (!user.user_metadata?.profile_completed) {
    api.redirect.sendUserTo("/onboarding/profile", {
      query: {
        step: user.user_metadata?.onboarding_step || "1",
        user_id: user.user_id,
      },
    });
  }
};
```

#### Terms of Service Updates

```typescript
onExecutePostLogin: async (event, api) => {
  const currentToSVersion = "2.1";
  const userToSVersion = event.user.user_metadata?.tos_accepted_version;

  if (userToSVersion !== currentToSVersion) {
    const tosToken = api.redirect.encodeToken({
      secret: process.env.TOS_SECRET,
      payload: {
        user_id: event.user.user_id,
        required_version: currentToSVersion,
        current_version: userToSVersion,
      },
      expiresInSeconds: 1800, // 30 minutes
    });

    api.redirect.sendUserTo("/legal/terms-update", {
      query: {
        token: tosToken,
        version: currentToSVersion,
      },
    });
  }
};
```

#### Admin Impersonation

```typescript
onExecutePostLogin: async (event, api) => {
  // Check if user has impersonation permissions
  const userPermissions = await event.ctx.env.data.userPermissions.list(
    event.client.tenant.id,
    event.user.user_id,
  );

  const canImpersonate = userPermissions.some(
    (perm) => perm.permission_name === "users:impersonate",
  );

  if (canImpersonate && event.client.client_id === "admin-dashboard") {
    api.redirect.sendUserTo("/u/impersonate", {
      query: {
        source: "post-login-hook",
        user_id: event.user.user_id,
      },
    });
  }
};
```

### Hook Error Handling

Programmatic hooks have built-in error handling that varies by hook type:

- **`onExecutePreUserRegistration`**: If the hook throws an error, it is logged but the registration continues. The error does not block user creation.
- **`onExecutePostUserRegistration`**: If the hook throws an error, it is logged but does not affect the completed registration.
- **`onExecutePreUserUpdate`**: If the hook throws an error or calls `api.cancel()`, the update operation is blocked and an HTTP 400 error is returned to the client.
- **`onExecuteCredentialsExchange`**: Errors can deny access using the `api.access.deny()` method. Other errors are logged and may affect token generation.
- **`onExecutePostLogin`**: Errors are logged but typically don't prevent the login from completing. However, redirects and form prompts can modify the authentication flow.

### Combining Programmatic and Management API Hooks

AuthHero allows you to use both programmatic hooks and Management API hooks (URL/Form hooks) simultaneously:

1. **Programmatic hooks** execute first and are ideal for:

   - Complex business logic requiring access to your application's dependencies
   - Synchronous operations that need to modify the authentication flow
   - Data validation and transformation

2. **Management API hooks** execute after programmatic hooks and are ideal for:
   - Integration with external services via webhooks
   - User-facing forms and progressive profiling
   - Configuration that can be managed by non-developers

This dual approach provides maximum flexibility, allowing you to handle core business logic in code while providing configurable extension points for specific use cases.

## Handling User Deletion

While AuthHero does not currently expose hooks for user deletion events, you can implement custom logic in your application layer when users are deleted. Here are recommended approaches:

### Approach 1: Wrapper Function

Create a wrapper function around the Management API's delete user endpoint:

```typescript
import { ManagementClient } from '@authhero/management-api';

async function deleteUserWithHooks(
  managementClient: ManagementClient,
  tenantId: string,
  userId: string
) {
  // Pre-deletion logic
  const user = await managementClient.users.get(tenantId, userId);
  
  // Perform any cleanup needed
  await cleanupUserData(user);
  await notifyExternalSystems(user);
  await archiveUserRecords(user);
  
  // Perform the actual deletion
  const result = await managementClient.users.delete(tenantId, userId);
  
  // Post-deletion logic
  if (result) {
    await sendDeletionConfirmation(user.email);
    await updateAnalytics('user_deleted', { user_id: userId });
  }
  
  return result;
}
```

### Approach 2: Event-Driven Architecture

If you're using an event-driven architecture, emit events before and after deletion:

```typescript
import { EventEmitter } from 'events';

const userEvents = new EventEmitter();

// Register event listeners
userEvents.on('user:before-delete', async (user) => {
  console.log(`Preparing to delete user ${user.user_id}`);
  await cleanupUserSessions(user);
});

userEvents.on('user:after-delete', async (userId) => {
  console.log(`User ${userId} deleted successfully`);
  await notifyTeam(userId);
});

// In your deletion handler
async function deleteUser(tenantId: string, userId: string) {
  const user = await managementClient.users.get(tenantId, userId);
  
  // Emit pre-deletion event
  await userEvents.emit('user:before-delete', user);
  
  // Delete the user
  const result = await managementClient.users.delete(tenantId, userId);
  
  if (result) {
    // Emit post-deletion event
    await userEvents.emit('user:after-delete', userId);
  }
  
  return result;
}
```

### Approach 3: Custom API Endpoint

Create a custom API endpoint in your application that wraps the Management API:

```typescript
// POST /api/users/:userId/delete
app.post('/api/users/:userId/delete', async (req, res) => {
  const { userId } = req.params;
  const tenantId = req.user.tenantId;
  
  try {
    // Pre-deletion validation
    const user = await managementClient.users.get(tenantId, userId);
    
    if (user.app_metadata?.protected) {
      return res.status(403).json({ error: 'Cannot delete protected user' });
    }
    
    // Pre-deletion actions
    await revokeAllTokens(tenantId, userId);
    await closeUserSessions(tenantId, userId);
    await exportUserData(user); // GDPR compliance
    
    // Perform deletion
    const result = await managementClient.users.delete(tenantId, userId);
    
    // Post-deletion actions
    if (result) {
      await auditLog.create({
        action: 'user_deleted',
        actor: req.user.id,
        target: userId,
        timestamp: new Date(),
      });
    }
    
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
```

### Best Practices for User Deletion

When implementing custom user deletion logic:

1. **Data Retention**: Consider legal and compliance requirements (GDPR, CCPA, etc.)
2. **Audit Trail**: Always log user deletions with actor, timestamp, and reason
3. **Cascade Deletion**: Clean up related data (sessions, tokens, preferences)
4. **Soft Delete Option**: Consider implementing soft deletes for recovery
5. **Confirmation**: Require explicit confirmation before permanent deletion
6. **Backup**: Archive user data before deletion for compliance
7. **Rate Limiting**: Implement rate limits to prevent accidental bulk deletions

::: tip Future Enhancement
If user deletion hooks are important for your use case, please reach out to the AuthHero team or open a feature request on GitHub. The AuthHero team is actively developing the platform and considers user feedback when prioritizing new features.
:::
