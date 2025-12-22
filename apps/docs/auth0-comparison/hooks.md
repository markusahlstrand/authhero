# Hooks: AuthHero vs. Auth0

Auth0 made the decision to deprecate its Hooks feature in October 2024, moving towards Actions as the primary way to customize authentication flows. While Actions offer powerful capabilities, AuthHero continues to support a flexible Hooks system that provides distinct advantages, especially for certain use cases.

::: tip Complete Hooks Documentation
For comprehensive documentation on hooks including lifecycle, configuration, payloads, and examples, see the [Hooks Guide](../guides/hooks.md).
:::

## Quick Comparison

| Feature                    | Auth0 Actions             | AuthHero Hooks       |
| -------------------------- | ------------------------- | -------------------- |
| **Status**                 | Active (Hooks deprecated) | Active & expanding   |
| **Validate Signup Email**  | ❌ Not available          | ✅ **AuthHero-only** |
| **Pre-User Registration**  | ✅                        | ✅                   |
| **Post-User Registration** | ✅                        | ✅                   |
| **Post-Login**             | ✅                        | ✅                   |
| **Pre-User Update**        | ❌ Limited                | ✅ Full support      |
| **Pre-User Deletion**      | ❌ Not available          | ✅ **AuthHero-only** |
| **Post-User Deletion**     | ❌ Not available          | ✅ **AuthHero-only** |
| **Credentials Exchange**   | ✅                        | ✅                   |
| **Form Rendering**         | ❌                        | ✅ **AuthHero-only** |
| **Entity Hooks**           | ❌ Not available          | ✅ **AuthHero-only** |
| **URL Webhooks**           | ✅                        | ✅                   |

::: tip AuthHero Exclusive Features
AuthHero provides several hooks not available in Auth0:

- **Validate Signup Email**: Check if signup is allowed before creating user
- **Pre/Post User Deletion**: Full control over user deletion lifecycle
- **Form Rendering**: Present custom forms directly in authentication flow
- **Pre-User Update**: Validate and modify all user updates
- **Entity Hooks**: Lifecycle hooks for roles, connections, resource servers, and role permissions
  :::

## Supported Trigger IDs

AuthHero supports the following trigger points for hooks:

### Via Management API (URL/Form/Page Hooks)

- `validate-registration-username` - Validate if email can sign up (before user exists)
- `pre-user-registration` - Before user creation
- `post-user-registration` - After user creation
- `post-user-login` - After authentication
- `pre-user-deletion` - Before user deletion
- `post-user-deletion` - After user deletion

### Via Code (Programmatic Hooks)

- `onExecuteValidateRegistrationUsername` - Validate signup eligibility
- `onExecutePreUserRegistration` - Before user creation
- `onExecutePostUserRegistration` - After user creation
- `onExecutePostLogin` - After authentication
- `onExecutePreUserUpdate` - Before user updates
- `onExecutePreUserDeletion` - Before user deletion
- `onExecutePostUserDeletion` - After user deletion
- `onExecuteCredentialsExchange` - During token exchange

````

For detailed information on each hook including payloads, API methods, and examples, see the [Hooks Guide](../guides/hooks.md).

## Key Architectural Differences

### Hook Types

AuthHero supports multiple hook types:

1. **Code-Based Hooks**: Functions defined in application initialization
2. **URL Hooks (Webhooks)**: HTTP endpoints called at trigger points
3. **Form Hooks**: Render custom forms in the authentication flow
4. **Page Hooks**: Redirect to custom pages with permission checks
5. **Entity Hooks**: Lifecycle hooks for management entities (roles, connections, etc.)

Auth0 Actions primarily focus on code-based actions with limited webhook support and no entity-level hooks.

### User Lifecycle Hooks: Synchronous vs. Asynchronous

| Hook Type                       | Execution | Can Block Flow |
| ------------------------------- | --------- | -------------- |
| Validate Signup Email           | Sync      | ✅ Yes         |
| Pre-User Registration           | Sync      | ✅ Yes         |
| Post-User Registration          | Async     | ❌ No          |
| Post-Login (code/form/page)     | Sync      | ✅ Yes         |
| Post-Login (webhooks)           | Async     | ❌ No          |
| Pre-User Update                 | Sync      | ✅ Yes         |
| Pre-User Deletion               | Sync      | ✅ Yes         |
| Post-User Deletion              | Async     | ❌ No          |
| Post-User Registration Webhooks | Async     | ❌ No          |

See the [Hook Execution Order](../guides/hooks.md#hook-execution-order-summary) section for complete lifecycle details.

### Entity Hooks

AuthHero provides entity hooks for managing configuration entities at the data adapter layer. These hooks are **not available in Auth0**.

**Supported Entities:**
- **Roles**: Create, update, delete lifecycle hooks
- **Connections**: Create, update, delete lifecycle hooks  
- **Resource Servers**: Create, update, delete lifecycle hooks
- **Role Permissions**: Assign and remove hooks for permission management

**Key Features:**
- Execute at the data adapter layer (not REST layer)
- `before*` hooks can modify or validate data
- `after*` hooks for side effects (audit logging, syncing to external systems)
- Throwing errors in `before*` hooks blocks the operation

**Use Cases:**
- Sync role permissions to external resource servers
- Audit logging for entity changes
- Validate entity configurations before save
- Initialize default settings for new entities

See the [Entity Hooks Guide](../guides/hooks.md#entity-hooks) for detailed documentation and examples.

## Configuration Methods

### Via Code (Initialization)

```typescript
const authhero = new AuthHero({
  hooks: {
    onExecuteValidateRegistrationUsername: async (event, api) => {
      // Validate signup
    },
    onExecutePostLogin: async (event, api) => {
      // Handle post-login
    },
    // ... other user lifecycle hooks
  },
  entityHooks: {
    roles: {
      beforeCreate: async (context, insert) => {
        // Validate or modify before creation
        return insert;
      },
      afterCreate: async (context, entity) => {
        // Post-creation tasks
      },
    },
    rolePermissions: {
      afterAssign: async (context, roleId, permissions) => {
        // Sync to external systems
      },
    },
  },
});
````

### Via Management API

```bash
# Create webhook
POST /api/v2/hooks
{
  "name": "Post-Login Webhook",
  "trigger_id": "post-user-login",
  "url": "https://api.example.com/hooks",
  "enabled": true
}

# Create form hook
POST /api/v2/hooks
{
  "trigger_id": "post-user-login",
  "form_id": "form_123",
  "enabled": true
}
```

For complete configuration examples, see the [Hooks Guide Configuration Section](../guides/hooks.md#configuration).

## Migration from Auth0

If you're migrating from Auth0 Actions to AuthHero Hooks:

1. **Post-Login Actions** → `onExecutePostLogin` (Auth0-compatible API)
2. **Pre-User Registration** → `onExecutePreUserRegistration`
3. **Post-User Registration** → `onExecutePostUserRegistration`
4. **Credentials Exchange** → `onExecuteCredentialsExchange`

AuthHero's `onExecutePostLogin` hook provides an Auth0-compatible event object and API, making migration straightforward.

## Additional Resources

- [Hooks Guide](../guides/hooks.md) - Complete hooks documentation
- [Hook Lifecycle](../guides/hooks.md#hook-lifecycle) - Detailed execution flow
- [Hook Types](../guides/hooks.md#hook-types) - Code, webhooks, forms, and pages
- [API Objects](../guides/hooks.md#api-objects) - Available APIs in each hook
- [Best Practices](../guides/hooks.md#best-practices) - Implementation guidelines
- [Common Use Cases](../guides/hooks.md#common-use-cases) - Real-world examples

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

- `validate-registration-username` - Validate registration eligibility
- `pre-user-registration` - Before a new user is created
- `post-user-registration` - After a new user is successfully created
- `post-user-login` - After successful authentication
- `pre-user-deletion` - Before user deletion
- `post-user-deletion` - After user deletion

::: info Note on User Deletion and Updates
URL and Form hooks now support user deletion triggers (`pre-user-deletion` and `post-user-deletion`). For user updates and other events, you can use **programmatic hooks** (see below) which provide more direct access to the authentication flow.
:::

```

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

### Hook Availability Comparison

| Event/Trigger          | URL/Form Hooks (Management API)        | Programmatic Hooks (Config)        |
| ---------------------- | -------------------------------------- | ---------------------------------- |
| Validate Registration  | ✅ `validate-registration-username`    | ✅ `onExecuteValidateRegistrationUsername`  |
| Pre User Registration  | ✅ `pre-user-registration`             | ✅ `onExecutePreUserRegistration`  |
| Post User Registration | ✅ `post-user-registration`            | ✅ `onExecutePostUserRegistration` |
| Post User Login        | ✅ `post-user-login`                   | ✅ `onExecutePostLogin`            |
| Pre User Update        | ❌ Not Available                       | ✅ `onExecutePreUserUpdate`        |
| Pre User Deletion      | ✅ `pre-user-deletion`                 | ✅ `onExecutePreUserDeletion`      |
| Post User Deletion     | ✅ `post-user-deletion`                | ✅ `onExecutePostUserDeletion`     |
| Credentials Exchange   | ❌ Not Available                       | ✅ `onExecuteCredentialsExchange`  |

```

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

#### 6. `onExecutePreUserDeletion`

Triggered before a user deletion is executed. This allows you to validate the deletion request, perform pre-deletion checks, or cancel the deletion if needed.

**Event Data:**

- `ctx`: Hono context object
- `user`: The user object being deleted
- `user_id`: The ID of the user being deleted
- `tenant`: Object containing the tenant ID
- `request`: Request details (IP, user agent, method, URL)

**API Methods:**

- `cancel()`: Cancel the deletion operation

**Note:** If the hook throws an error or calls `cancel()`, the deletion will be prevented. This is useful for implementing deletion policies, checking for dependencies, or requiring additional confirmation.

#### 7. `onExecutePostUserDeletion`

Triggered after a user has been successfully deleted. This allows you to perform cleanup operations, send notifications, or log the deletion for audit purposes.

**Event Data:**

- `ctx`: Hono context object
- `user`: The user object that was deleted
- `user_id`: The ID of the user that was deleted
- `tenant`: Object containing the tenant ID
- `request`: Request details (IP, user agent, method, URL)

**API Methods:**

- (No API methods - this is an informational hook only)

**Note:** Unlike Auth0 which doesn't have built-in user deletion action triggers, AuthHero provides both pre and post deletion hooks to help with compliance requirements (GDPR, etc.) and cleanup operations. The post-deletion hook runs after successful deletion, so errors in this hook are logged but don't affect the deletion result.

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

    onExecutePreUserDeletion: async (event, api) => {
      // Validate deletion - prevent deletion of admin users
      if (event.user.app_metadata?.role === "admin") {
        api.cancel(); // This will prevent the deletion
        return;
      }

      // Check for dependencies
      const hasActiveSubscription = await checkUserSubscription(event.user_id);
      if (hasActiveSubscription) {
        api.cancel();
        return;
      }
    },

    onExecutePostUserDeletion: async (event, api) => {
      // Perform cleanup operations after user is deleted
      await deleteUserDataFromExternalSystems(event.user_id);
      await sendAccountDeletionEmail(event.user.email);

      // Log for audit purposes
      console.log(
        `User ${event.user_id} deleted from tenant ${event.tenant.id}`,
      );
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

### Service Token API (Available in All Hooks)

**All programmatic hooks** in AuthHero provide a `token` API that allows you to generate service tokens for authenticating with external APIs. This is particularly useful when you need to interact with external systems like CRMs, analytics platforms, or third-party services during any authentication or user lifecycle event.

#### API Interface

The token API is available in all hooks via `api.token.createServiceToken()`:

```typescript
api.token.createServiceToken({
  scope: string;           // The scope(s) for the token (space-separated)
  expiresInSeconds?: number; // Optional expiration time (default: 3600 = 1 hour)
}): Promise<string>
```

The service token is a JWT signed with your AuthHero instance's private key and includes:

- **client_id**: Always set to `"auth-service"` (hardcoded for security)
- **scope**: The requested scope(s)
- **tenant_id**: Your tenant ID
- **exp**: Expiration timestamp

#### Security Considerations

The `client_id` is hardcoded to `"auth-service"` to prevent potential spoofing attacks where malicious hook code could try to generate tokens with arbitrary client IDs. This ensures that service tokens are clearly identifiable and can be validated by your external services.

#### Available in All Hooks

The token API is available in:

- `onExecuteCredentialsExchange` - Generate tokens during authentication flows
- `onExecutePreUserRegistration` - Generate tokens before user registration
- `onExecutePostUserRegistration` - Generate tokens after user registration
- `onExecutePreUserUpdate` - Generate tokens before user updates
- `onExecutePostLogin` - Generate tokens during post-login flows
- `onExecutePreUserDeletion` - Generate tokens before user deletion
- `onExecutePostUserDeletion` - Generate tokens after user deletion

#### User Registration Example

```typescript
onExecutePostUserRegistration: async (event, api) => {
  // Create user in external CRM after registration
  const serviceToken = await api.token.createServiceToken({
    scope: "write:users",
    expiresInSeconds: 300, // 5 minutes
  });

  await fetch("https://crm.example.com/api/users", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: event.user.email,
      name: event.user.name,
      user_id: event.user.user_id,
    }),
  });
},
```

#### User Deletion Example

Both `onExecutePreUserDeletion` and `onExecutePostUserDeletion` hooks have access to the token API for managing external service cleanup:

##### Pre-Deletion Hook Example

```typescript
onExecutePreUserDeletion: async (event, api) => {
  // Check if user can be deleted from external CRM
  const serviceToken = await api.token.createServiceToken({
    scope: "read:users delete:users",
    expiresInSeconds: 600, // 10 minutes
  });

  const canDelete = await fetch(
    `https://crm.example.com/api/users/${event.user_id}/can-delete`,
    {
      headers: {
        Authorization: `Bearer ${serviceToken}`,
      },
    }
  );

  if (!canDelete.ok) {
    api.cancel(); // Prevent deletion
    return;
  }
},
```

##### Post-Deletion Hook Example

```typescript
onExecutePostUserDeletion: async (event, api) => {
  // Generate token to authenticate with external services
  const serviceToken = await api.token.createServiceToken({
    scope: "delete:user_data",
    expiresInSeconds: 300, // 5 minutes
  });

  // Delete user data from CRM
  await fetch(`https://crm.example.com/api/users/${event.user_id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceToken}`,
    },
  });

  // Delete user from analytics platform
  await fetch(`https://analytics.example.com/api/users/${event.user_id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceToken}`,
    },
  });

  // Delete user from notification service
  await fetch(
    `https://notifications.example.com/api/users/${event.user_id}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${serviceToken}`,
      },
    }
  );
},
```

#### Validating Service Tokens in External Services

Your external services should validate the service token by:

1. Verifying the JWT signature using your AuthHero instance's public key (available at `https://your-domain.com/.well-known/jwks.json`)
2. Checking that `client_id` equals `"auth-service"`
3. Verifying the token hasn't expired
4. Validating that the `scope` includes the required permissions

Example validation in an external service:

```typescript
import { jwtVerify, createRemoteJWKSet } from "jose";

const JWKS = createRemoteJWKSet(
  new URL("https://your-authhero-domain.com/.well-known/jwks.json"),
);

async function validateServiceToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: "https://your-authhero-domain.com",
    });

    // Verify it's a service token
    if (payload.client_id !== "auth-service") {
      throw new Error("Invalid client_id");
    }

    // Check required scope
    const scopes = (payload.scope as string)?.split(" ") || [];
    if (!scopes.includes("delete:user_data")) {
      throw new Error("Insufficient scope");
    }

    return payload;
  } catch (error) {
    console.error("Token validation failed:", error);
    throw error;
  }
}
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
- **`onExecutePreUserDeletion`**: If the hook throws an error or calls `api.cancel()`, the deletion operation is blocked and prevented.
- **`onExecutePostUserDeletion`**: Errors are logged but don't affect the deletion (the user has already been deleted).
- **`onExecuteCredentialsExchange`**: Errors can deny access using the `api.access.deny()` method. Other errors are logged and may affect token generation.
- **`onExecutePostLogin`**: Errors are logged but typically don't prevent the login from completing. However, redirects and form prompts can modify the authentication flow.

### Hook Execution Order

Understanding when hooks execute is important for proper implementation:

**User Registration Flow:**

1. `onExecutePreUserRegistration` - Before user is created (can modify user data)
2. User is created in database
3. `onExecutePostUserRegistration` - After user is created (informational)

**User Update Flow:**

1. `onExecutePreUserUpdate` - Before user is updated (can modify or cancel update)
2. User is updated in database
3. Account linking checks (if email changed)

**User Deletion Flow:**

1. `onExecutePreUserDeletion` - Before user is deleted (can cancel deletion)
2. User is deleted from database
3. Deletion is logged
4. `onExecutePostUserDeletion` - After user is deleted (cleanup operations)

**Login Flow:**

1. User authentication occurs
2. `onExecutePostLogin` - After authentication (can redirect or add form)
3. Tokens are issued (or redirect happens)

**Token Exchange Flow:**

1. `onExecuteCredentialsExchange` - Before tokens are issued (can modify claims or deny)
2. Tokens are generated and returned

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

## User Deletion Best Practices

With the addition of `onExecutePreUserDeletion` and `onExecutePostUserDeletion` hooks, you have full control over the user deletion lifecycle. Here are recommended practices:

### Pre-Deletion Validation

Use `onExecutePreUserDeletion` to enforce business rules before deletion:

```typescript
onExecutePreUserDeletion: async (event, api) => {
  const user = await event.ctx.env.data.users.get(
    event.tenant.id,
    event.user_id,
  );

  // Prevent deletion of protected users
  if (user?.app_metadata?.protected) {
    console.log(`Blocked deletion of protected user: ${event.user_id}`);
    api.cancel();
    return;
  }

  // Prevent deletion if user has active subscriptions
  const hasActiveSubscription = await checkActiveSubscription(user);
  if (hasActiveSubscription) {
    console.log(`User ${event.user_id} has active subscription`);
    api.cancel();
    return;
  }

  // Log the deletion request
  console.log(`User deletion approved for: ${event.user_id}`);
};
```

### Post-Deletion Cleanup

Use `onExecutePostUserDeletion` for cleanup operations:

```typescript
onExecutePostUserDeletion: async (event, api) => {
  const userId = event.user_id;
  const tenantId = event.tenant.id;

  // Revoke all tokens
  await revokeAllUserTokens(tenantId, userId);

  // Clean up external systems
  await removeFromCRM(userId);
  await deleteFromAnalytics(userId);
  await notifyExternalSystems("user_deleted", { user_id: userId });

  // Send confirmation (if email available in event context)
  if (event.user?.email) {
    await sendDeletionConfirmation(event.user.email);
  }

  // Audit logging
  console.log(`User ${userId} deleted and cleaned up successfully`);
};
```

### Compliance and Data Retention

When implementing deletion hooks, consider:

1. **GDPR/CCPA Compliance**: Export user data before deletion if required
2. **Audit Trail**: Log who deleted the user and when
3. **Cascade Deletion**: Clean up related data (sessions, tokens, preferences)
4. **Rate Limiting**: Implement rate limits to prevent accidental bulk deletions
5. **Soft Delete Option**: Consider flagging users as deleted rather than removing them
6. **Backup**: Archive critical user data before permanent deletion
7. **Notification**: Notify relevant parties (user, admin, compliance team)

### Complete Example

```typescript
const config: AuthHeroConfig = {
  dataAdapter: adapter,
  hooks: {
    onExecutePreUserDeletion: async (event, api) => {
      const user = await event.ctx.env.data.users.get(
        event.tenant.id,
        event.user_id,
      );

      // Business rule validation
      if (
        user?.app_metadata?.role === "admin" &&
        (await isLastAdmin(event.tenant.id))
      ) {
        console.error("Cannot delete last admin user");
        api.cancel();
        return;
      }

      // Export data for compliance
      if (user) {
        await exportUserDataForCompliance(user);
      }

      console.log(`Pre-deletion checks passed for user: ${event.user_id}`);
    },

    onExecutePostUserDeletion: async (event, api) => {
      // Clean up all user-related data
      await Promise.all([
        revokeAllUserTokens(event.tenant.id, event.user_id),
        deleteUserSessions(event.tenant.id, event.user_id),
        removeFromExternalServices(event.user_id),
        updateAnalytics("user_deleted", { user_id: event.user_id }),
      ]);

      console.log(`User ${event.user_id} fully deleted and cleaned up`);
    },
  },
};
```
