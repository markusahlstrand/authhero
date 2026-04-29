---
title: Hooks Guide
description: Comprehensive guide to AuthHero hooks including lifecycle, configuration options, code-based hooks, webhooks, form hooks, and page hooks.
---

# Hooks Guide

This guide explains how hooks work in AuthHero, including their lifecycle, configuration options, and usage patterns.

::: tip Looking for the design details?
The [Hooks & Outbox Pipeline](../architecture/hooks-pipeline.md) architecture doc explains the **why**: the three-phase execution model (prepare / commit / publish), transaction boundaries, outbox-based post-hook delivery, dead-letter, and self-healing. Start there if you are adding a new trigger or debugging a webhook that "never fired."
:::

## Overview

AuthHero provides a flexible hooks system that allows you to execute custom logic at key points in the authentication lifecycle. Hooks can be implemented as:

- **Code-based hooks**: Functions defined in your application code
- **Webhooks**: HTTP endpoints that receive hook events
- **Form hooks**: Redirect users to custom forms
- **Page hooks**: Redirect users to custom pages with permission checks

## Hook Lifecycle

### User Registration Flow

When a user signs up, the following hooks are triggered in order:

1. **Validate Registration Username** (`validateRegistrationUsername` / `onExecuteValidateRegistrationUsername`)
   - Runs when email is entered on identifier page (before user exists)
   - Checks if signup is allowed for this email
   - **Synchronous**: Blocks signup if validation fails
   - **Can modify**: Cannot modify user (no user exists yet)
   - Can be called on identifier page without creating a user

2. **Pre-User Registration** (`preUserRegistrationHook`)
   - Runs **RIGHT BEFORE** user creation
   - Executes for ALL signup methods (email/password, code, social, etc.)
   - **Synchronous**: Can block signup by throwing an exception
   - **Can modify**: Cannot modify user (not created yet)
   - Invokes `preUserRegistrationWebhook` if configured

3. **Pre-User Registration** (`onExecutePreUserRegistration`)
   - Code-based hook that runs just before user creation
   - **Synchronous**: Runs before DB insert
   - **Can modify**: Can set user metadata via `api.user.setUserMetadata()`
   - Has access to request context and token API

4. **User Creation**
   - User record is created in the database

5. **Account Linking** (`commitUserHook` + `account-linking` template)
   - Built-in path: when `userLinkingMode` resolves to `"builtin"` (the default), `commitUserHook` looks up an existing primary by verified email inside the commit transaction and sets `linked_to` atomically with the `rawCreate`.
   - Template path: any enabled `account-linking` template hook at `post-user-registration` runs after the commit. The template is a pre-defined function (not user code) — tenants enable it by creating a `TemplateHook` with `template_id: "account-linking"`. See [Account Linking](/auth0-comparison/account-linking) for the toggles.

6. **Post-User Registration** (`onExecutePostUserRegistration`)
   - Code-based hook that runs after user creation
   - **Asynchronous**: Errors are logged but don't block the flow
   - **Can modify**: Cannot modify user (already created)
   - Has access to created user and token API

7. **Post-User Registration Webhook** (`postUserRegistrationWebhook`)
   - HTTP webhook invoked after user creation
   - **Delivered via the outbox** — retried with exponential backoff, dead-lettered after `maxRetries` (see [Failed events](/customization/failed-events))
   - **Idempotent by contract**: each POST carries `Idempotency-Key: {event.id}` so retries dedupe on the receiving side
   - **Self-heals**: if delivery dead-letters, the user's next login re-enqueues the event until it succeeds
   - **Can modify**: Cannot modify user (already created)

### User Login Flow

When a user logs in, the following hooks are triggered:

1. **User Authentication**
   - User credentials are verified

2. **Login Statistics Update**
   - `last_login`, `last_ip`, and `login_count` are updated

3. **Post-Login Code Hook** (`onExecutePostLogin`)
   - Code-based hook with Auth0-compatible API
   - **Synchronous**: Can modify authentication flow
   - **Can modify**: Can redirect users, render forms, modify tokens
   - Can access user, client, transaction, and session information

4. **Post-Login Form Hook**
   - If configured, redirects to custom form
   - **Synchronous**: User must complete form before continuing
   - **Can modify**: Form can collect additional data

5. **Post-Login Page Hook**
   - If configured, redirects to custom page
   - **Synchronous**: User must complete page flow
   - Can require specific permissions

6. **Post-Login Webhooks**
   - All enabled webhooks are invoked
   - **Asynchronous**: Errors are logged but don't block the flow
   - **Can modify**: Cannot modify user or tokens

### User Update Flow

When a user is updated via the Management API:

1. **Pre-User Update Hook** (`onExecutePreUserUpdate`)
   - Code-based hook that runs before update
   - **Synchronous**: Can block update by calling `api.cancel()`
   - **Can modify**: Can modify update data via `api.user.setUserMetadata()`
   - Has access to current user state and requested updates

2. **User Update**
   - User record is updated in database

3. **Email Verification Check** (built-in path, when enabled)
   - If `userLinkingMode` resolves to `"builtin"` (the default) and the update touched `email` or `email_verified`, the same in-transaction lookup as user creation runs and sets `linked_to` to a matching primary if one exists.

4. **Post-User-Update Template Hooks**
   - Any enabled `account-linking` template hook at `post-user-update` runs after the commit closes. Useful when a tenant has set `userLinkingMode: "off"` and wants linking driven entirely by the template at all three triggers (login, registration, update).

### User Deletion Flow

When a user is deleted:

1. **Pre-User Deletion Hook** (`onExecutePreUserDeletion`)
   - Code-based hook that runs before deletion
   - **Synchronous**: Can block deletion by calling `api.cancel()`
   - **Can modify**: Cannot modify user (will be deleted)
   - Has access to user data before deletion

2. **User Deletion**
   - User record is removed from database

3. **Post-User Deletion Hook** (`onExecutePostUserDeletion`)
   - Code-based hook that runs after successful deletion
   - **Asynchronous**: Errors are logged but don't prevent deletion
   - **Can modify**: Cannot modify user (already deleted)

## Entity Hooks

In addition to user lifecycle hooks, AuthHero provides entity hooks that allow you to execute custom logic when management entities (roles, connections, resource servers, and role permissions) are created, updated, deleted, or modified.

### Overview

Entity hooks work at the data adapter layer, ensuring they fire regardless of which code path calls the adapter (REST API, internal code, etc.). This is similar to how caching works in AuthHero.

Available entity types:

- **Roles**: `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete`
- **Connections**: `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete`
- **Resource Servers**: `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete`
- **Role Permissions**: `beforeAssign`, `afterAssign`, `beforeRemove`, `afterRemove`

### Configuration

Entity hooks are configured during AuthHero initialization. Each entity type accepts an **array of hook objects**, allowing you to chain multiple hook handlers together:

```typescript
const authhero = new AuthHero({
  // ... other config
  entityHooks: {
    roles: [
      {
        beforeCreate: async (context, insert) => {
          console.log(`Creating role: ${insert.name}`);
          // Validate or modify the insert data
          return insert;
        },
        afterCreate: async (context, entity) => {
          console.log(`Role created: ${entity.name} (${entity.id})`);
          // Perform post-creation tasks (e.g., audit logging)
        },
        beforeUpdate: async (context, id, update) => {
          console.log(`Updating role ${id}`);
          // Validate or modify the update data
          return update;
        },
        afterUpdate: async (context, entity) => {
          console.log(`Role updated: ${entity.name}`);
        },
        beforeDelete: async (context, id) => {
          console.log(`Deleting role ${id}`);
          // Validate deletion or cleanup
        },
        afterDelete: async (context, id) => {
          console.log(`Role deleted: ${id}`);
          // Perform post-deletion cleanup
        },
      },
    ],
    connections: [
      {
        beforeCreate: async (context, insert) => {
          // Validate connection settings
          return insert;
        },
        afterCreate: async (context, entity) => {
          // Sync to external systems
        },
        // ... other hooks
      },
    ],
    resourceServers: [
      {
        beforeCreate: async (context, insert) => {
          // Validate resource server configuration
          return insert;
        },
        afterCreate: async (context, entity) => {
          // Initialize default permissions
        },
        // ... other hooks
      },
    ],
    rolePermissions: [
      {
        beforeAssign: async (context, roleId, permissions) => {
          console.log(`Assigning permissions to role ${roleId}`);
          // Validate permissions before assignment
          return permissions;
        },
        afterAssign: async (context, roleId, permissions) => {
          console.log(`Permissions assigned to role ${roleId}`);
          // Sync role security to external systems (e.g., resource servers)
        },
        beforeRemove: async (context, roleId, permissionIds) => {
          console.log(`Removing permissions from role ${roleId}`);
          // Validate permission removal
          return permissionIds;
        },
        afterRemove: async (context, roleId, permissionIds) => {
          console.log(`Permissions removed from role ${roleId}`);
          // Update external systems
        },
      },
    ],
  },
});
```

### Hook Context

All entity hooks receive a context object with the tenant information:

```typescript
interface EntityHookContext {
  tenantId: string;
}
```

### Hook Signatures

#### CRUD Entity Hooks (Roles, Connections, Resource Servers)

```typescript
interface EntityHooks<TEntity, TInsert, TUpdate> {
  beforeCreate?: (
    context: EntityHookContext,
    insert: TInsert,
  ) => Promise<TInsert>;

  afterCreate?: (context: EntityHookContext, entity: TEntity) => Promise<void>;

  beforeUpdate?: (
    context: EntityHookContext,
    id: string,
    update: TUpdate,
  ) => Promise<TUpdate>;

  afterUpdate?: (context: EntityHookContext, entity: TEntity) => Promise<void>;

  beforeDelete?: (context: EntityHookContext, id: string) => Promise<void>;

  afterDelete?: (context: EntityHookContext, id: string) => Promise<void>;
}
```

#### Role Permission Hooks

```typescript
interface RolePermissionHooks {
  beforeAssign?: (
    context: EntityHookContext,
    roleId: string,
    permissions: Array<{
      permission_name: string;
      resource_server_identifier: string;
    }>,
  ) => Promise<
    Array<{ permission_name: string; resource_server_identifier: string }>
  >;

  afterAssign?: (
    context: EntityHookContext,
    roleId: string,
    permissions: Array<{
      permission_name: string;
      resource_server_identifier: string;
    }>,
  ) => Promise<void>;

  beforeRemove?: (
    context: EntityHookContext,
    roleId: string,
    permissionIds: string[],
  ) => Promise<string[]>;

  afterRemove?: (
    context: EntityHookContext,
    roleId: string,
    permissionIds: string[],
  ) => Promise<void>;
}
```

### Use Cases

#### Sync Role Permissions to Resource Servers

````typescript
rolePermissions: [
  {
    afterAssign: async (context, roleId, permissions) => {
      // Get role details
      const role = await dataAdapter.roles.get(context.tenantId, roleId);

      // For each unique resource server, sync the role's permissions
      const resourceServers = new Set(
        permissions.map(p => p.resource_server_identifier)
      );

      for (const identifier of resourceServers) {
        const rolePermissions = permissions
          .filter(p => p.resource_server_identifier === identifier)
          .map(p => p.permission_name);

        // Sync to external resource server
        await fetch(`https://${identifier}/api/roles/${role.name}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions: rolePermissions })
        });
      }
    },
    afterRemove: async (context, roleId, permissionIds) => {
      // Similar logic to remove permissions from resource servers
    },
  },
],

#### Audit Logging for Role Changes

```typescript
roles: [
  {
    afterCreate: async (context, entity) => {
      await auditLog.log({
        tenantId: context.tenantId,
        action: 'role.created',
        resourceType: 'role',
        resourceId: entity.id,
        details: { name: entity.name, description: entity.description }
      });
    },
    afterUpdate: async (context, entity) => {
      await auditLog.log({
        tenantId: context.tenantId,
        action: 'role.updated',
        resourceType: 'role',
        resourceId: entity.id,
        details: { name: entity.name }
      });
    },
    afterDelete: async (context, id) => {
      await auditLog.log({
        tenantId: context.tenantId,
        action: 'role.deleted',
        resourceType: 'role',
        resourceId: id
      });
    },
  },
],
````

#### Validate Connection Settings

```typescript
connections: [
  {
    beforeCreate: async (context, insert) => {
      // Validate required fields based on connection type
    if (insert.strategy === 'auth0' && !insert.options?.client_id) {
      throw new Error('Auth0 connections require a client_id');
    }
    return insert;
  },
  beforeUpdate: async (context, id, update) => {
    // Ensure critical settings aren't removed
    if (update.enabled_clients !== undefined && update.enabled_clients.length === 0) {
      throw new Error('Connection must have at least one enabled client');
    }
    return update;
  },
  },
],
```

#### Initialize Default Permissions for Resource Servers

```typescript
resourceServers: [
  {
    afterCreate: async (context, entity) => {
      // Create default permissions for new resource server
    const defaultPermissions = [
      { value: "read:all", description: "Read all resources" },
      { value: "write:all", description: "Write all resources" },
      { value: "delete:all", description: "Delete all resources" },
    ];

    for (const permission of defaultPermissions) {
      await dataAdapter.permissions.create(context.tenantId, {
        resource_server_id: entity.id,
        ...permission,
      });
    }
  },
  },
],
```

### Differences from User Lifecycle Hooks

| Aspect          | User Lifecycle Hooks                                                | Entity Hooks                                                             |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Purpose**     | Control authentication and user management flows                    | Manage configuration entities (roles, connections, etc.)                 |
| **Layer**       | Application layer (routes, authentication flow)                     | Data adapter layer                                                       |
| **Synchronous** | Mixed (some block flow, some are async)                             | All `before*` hooks can modify data, `after*` hooks are for side effects |
| **Can Modify**  | Limited (via API methods like `api.user.setUserMetadata()`)         | `before*` hooks return modified data directly                            |
| **Blocking**    | Some hooks can deny operations (e.g., `api.deny()`, `api.cancel()`) | Throw errors in `before*` hooks to block operations                      |
| **Webhooks**    | Supported                                                           | Not supported (code-based only)                                          |

## Hook Types

### Code-Based Hooks

Code-based hooks are functions defined in your application initialization:

```typescript
const authhero = new AuthHero({
  hooks: {
    onExecuteValidateRegistrationUsername: async (event, api) => {
      // Validate if email is allowed to sign up
      if (event.user.email.endsWith("@competitor.com")) {
        api.deny("Signups from this domain are not allowed");
      }

      // Or use token API for external validation
      const token = await api.token.createServiceToken({
        scope: "read:users",
        expiresInSeconds: 300,
      });
    },

    onExecutePostLogin: async (event, api) => {
      // Access user, client, and request information
      console.log(`User ${event.user.email} logged in`);

      // Modify authentication flow
      if (event.user.email.endsWith("@external.com")) {
        api.redirect.sendUserTo("https://external-idp.com/verify", {
          query: { email: event.user.email },
        });
      }

      // Create service tokens for API calls
      const token = await api.token.createServiceToken({
        scope: "read:users",
        expiresInSeconds: 300,
      });
    },

    onExecutePreUserRegistration: async (event, api) => {
      // Set custom user metadata
      await api.user.setUserMetadata("signup_date", new Date().toISOString());
      await api.user.setUserMetadata("signup_ip", event.request.ip);
    },

    onExecutePostUserRegistration: async (event, api) => {
      // Perform post-registration tasks
      console.log(`New user registered: ${event.user.email}`);
    },

    onExecutePreUserUpdate: async (event, api) => {
      // Validate or modify updates
      if (
        event.updates.email &&
        !event.updates.email.endsWith("@company.com")
      ) {
        api.cancel(); // Blocks the update
      }

      // Add additional metadata
      await api.user.setUserMetadata("last_updated_by", "admin");
    },

    onExecutePreUserDeletion: async (event, api) => {
      // Cleanup or validation before deletion
      if (event.user.app_metadata?.protected) {
        api.cancel();
      }
    },

    onExecutePostUserDeletion: async (event, api) => {
      // Cleanup after deletion
      console.log(`User ${event.user_id} was deleted`);
    },
  },
});
```

### Webhooks

Webhooks are HTTP endpoints that receive POST requests when hooks trigger:

**Request Format:**

```json
{
  "tenant_id": "tenant_123",
  "user": {
    "user_id": "auth0|123",
    "email": "user@example.com",
    ...
  },
  "trigger_id": "post-user-login"
}
```

**Response Format (for validation hooks):**

```json
{
  "allowed": false,
  "reason": "Optional denial reason"
}
```

**Configuration via Management API:**

```bash
POST /api/v2/hooks
{
  "name": "Post-Login Webhook",
  "trigger_id": "post-user-login",
  "url": "https://api.example.com/hooks/post-login",
  "enabled": true
}
```

#### Custom Webhook Invoker

By default, AuthHero invokes webhooks with a `POST` request containing a JSON body and a `Bearer` token generated by the built-in service token creator. You can replace this behavior entirely by providing a `webhookInvoker` function in the AuthHero configuration.

This is useful when you need to:

- Format the request body differently (e.g., wrap the payload in an envelope)
- Use your own authentication mechanism (API keys, HMAC signatures, etc.)
- Add custom headers or logging
- Route webhooks through a proxy or message queue

**Configuration:**

```typescript
import { init } from "authhero";

const { app } = init({
  dataAdapter,
  webhookInvoker: async ({ hook, data, tenant_id, createServiceToken }) => {
    // Use the built-in service token, or replace with your own auth
    const token = await createServiceToken();

    return fetch(hook.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Tenant-Id": tenant_id,
      },
      body: JSON.stringify({
        event: data.trigger_id,
        timestamp: new Date().toISOString(),
        payload: data,
      }),
    });
  },
});
```

**Parameters:**

The `webhookInvoker` function receives a single object with these properties:

| Parameter             | Type                                  | Description                                                                                        |
| --------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `hook`                | `Hook`                                | The hook being invoked (contains `url`, `hook_id`, `trigger_id`, etc.)                             |
| `data`                | `Record<string, unknown>`             | The payload data for the webhook                                                                   |
| `tenant_id`           | `string`                              | The tenant ID                                                                                      |
| `createServiceToken`  | `(scope?: string) => Promise<string>` | Lazily creates a service token. Only generates the token when called — no overhead if not used.     |

The function must return a `Response` object. If the response status is >= 400, the webhook invocation will be logged as failed.

**Example: Using an API key instead of a service token:**

```typescript
const { app } = init({
  dataAdapter,
  webhookInvoker: async ({ hook, data }) => {
    return fetch(hook.url, {
      method: "POST",
      headers: {
        "X-API-Key": process.env.WEBHOOK_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  },
});
```

### Form Hooks

Form hooks redirect users to custom forms during the authentication flow:

```bash
POST /api/v2/hooks
{
  "name": "MFA Enrollment Form",
  "trigger_id": "post-user-login",
  "form_id": "form_abc123",
  "enabled": true
}
```

When triggered:

1. User is redirected to the form with state parameter
2. Form can access user context and login session
3. User completes form and is redirected back to authentication flow

### Page Hooks

Page hooks redirect users to custom pages with optional permission requirements:

```bash
POST /api/v2/hooks
{
  "name": "Terms Acceptance Page",
  "trigger_id": "post-user-login",
  "page_id": "page_xyz789",
  "permission_required": "accept:terms",
  "enabled": true
}
```

Features:

- Can require specific permissions before allowing access
- User context is passed to the page
- Supports redirect back to authentication flow

## Configuration

### Via Code (Initialization)

Pass hooks during AuthHero initialization:

```typescript
const authhero = new AuthHero({
  // ... other config
  hooks: {
    onExecuteValidateRegistrationUsername: async (event, api) => {
      /* ... */
    },
    onExecutePostLogin: async (event, api) => {
      /* ... */
    },
    onExecutePreUserRegistration: async (event, api) => {
      /* ... */
    },
    // ... other hooks
  },
});
```

### Via Management API

Create, update, or delete hooks using the Management API:

```bash
# Create a webhook hook
POST /api/v2/hooks
Authorization: Bearer {management_token}
Content-Type: application/json

{
  "name": "My Post-Login Hook",
  "trigger_id": "post-user-login",
  "url": "https://api.example.com/hooks/post-login",
  "enabled": true
}

# Create a form hook
POST /api/v2/hooks
{
  "name": "MFA Enrollment",
  "trigger_id": "post-user-login",
  "form_id": "form_123",
  "enabled": true
}

# List hooks
GET /api/v2/hooks?trigger_id=post-user-login

# Update hook
PATCH /api/v2/hooks/{hook_id}
{
  "enabled": false
}

# Delete hook
DELETE /api/v2/hooks/{hook_id}
```

## Available Hooks

### Validation Hooks

#### `onExecuteValidateRegistrationUsername`

Validates if an email can be used for signup.

**When it runs**: On identifier page when user enters email (before user exists)

**Synchronous**: Yes - blocks signup if denied

**Can modify user**: No (user doesn't exist yet)

**Event Payload**:

````

```typescript
{
  ctx: Context,              // Request context
  client: EnrichedClient,    // Client configuration with tenant and connections
  request: HookRequest,      // HTTP request details
  tenant: { id: string },
  user: {
    email: string,           // Email being validated
    connection: string       // Connection type (email, phone, etc.)
  }
}
````

**API Object**:

```typescript
{
  deny: (reason?: string) => void,  // Deny signup with optional reason
  token: {
    createServiceToken: (params: {
      scope: string,
      expiresInSeconds?: number,
      customClaims?: Record<string, unknown>
    }) => Promise<string>
  }
}
```

**Webhook Response** (if applicable):

```json
{
  "allowed": boolean,
  "reason": "Optional denial reason"
}
```

### Registration Hooks

#### `onExecutePreUserRegistration`

Runs before user creation, can modify user metadata.

**When it runs**: Just before user is created in database

**Synchronous**: Yes - runs before DB insert

**Can modify user**: Yes - via `api.user.setUserMetadata()`

**Event Payload**:

```typescript
{
  ctx: Context,
  user: User,                // User being created (minimal data)
  client: EnrichedClient,    // Client configuration with tenant and connections
  request: HookRequest,
  tenant: { id: string }
}
```

**API Object**:

```typescript
{
  user: {
    setUserMetadata: (key: string, value: any) => void
  },
  token: TokenAPI
}
```

#### `onExecutePostUserRegistration`

Runs after user creation for post-registration tasks.

**When it runs**: After user is created in database

**Synchronous**: No - errors are logged but don't block flow

**Can modify user**: No (already created)

**Event Payload**:

```typescript
{
  ctx: Context,
  user: User,                // Newly created user (full data)
  client: EnrichedClient,    // Client configuration with tenant and connections
  request: HookRequest,
  tenant: { id: string }
}
```

**API Object**:

```typescript
{
  user: {},                  // Empty object (no modification allowed)
  token: TokenAPI
}
```

### Login Hooks

#### `onExecutePostLogin`

Modifies authentication flow, tokens, or redirects users.

**When it runs**: After user authentication, before token issuance

**Synchronous**: Yes - can modify flow

**Can modify user**: Yes - indirectly via redirects/forms

**Event Payload** (Auth0-compatible):

```typescript
{
  user: User,
  client: Client,
  request: {
    ip: string,
    user_agent: string,
    geoip: {
      countryCode: string,
      // ... other geo fields
    }
  },
  transaction: {
    id: string,
    locale: string,
    redirect_uri: string,
    // ... other transaction fields
  },
  authentication: {
    methods: Array<{
      name: string,
      timestamp: string
    }>
  },
  authorization: {
    roles: string[]
  },
  connection: {
    id: string,
    name: string,
    strategy: string
  },
  organization?: {
    id: string,
    name: string,
    display_name: string
  },
  // ... other Auth0-compatible fields
}
```

**API Object**:

```typescript
{
  prompt: {
    render: (formId: string) => void
  },
  redirect: {
    sendUserTo: (url: string, options?: {
      query?: Record<string, string>
    }) => void,
    encodeToken: (options: {
      secret: string,
      payload: Record<string, any>,
      expiresInSeconds?: number
    }) => string,
    validateToken: (options: {
      secret: string,
      tokenParameterName?: string
    }) => Record<string, any> | null
  },
  token: TokenAPI
}
```

### User Management Hooks

#### `onExecutePreUserUpdate`

Validates or modifies user updates before they're applied.

**When it runs**: Before user update is written to database

**Synchronous**: Yes - can block update

**Can modify user**: Yes - can modify update data

**Event Payload**:

```typescript
{
  ctx: Context,
  tenant: { id: string },
  user_id: string,
  user: User,                // Current user state
  updates: Partial<User>,    // Requested changes
  request: HookRequest
}
```

**API Object**:

```typescript
{
  user: {
    setUserMetadata: (key: string, value: any) => void
  },
  cancel: () => void,        // Blocks the update
  token: TokenAPI
}
```

#### `onExecutePreUserDeletion`

Validates before user deletion.

**When it runs**: Before user is deleted from database

**Synchronous**: Yes - can block deletion

**Can modify user**: No (will be deleted)

**Event Payload**:

```typescript
{
  ctx: Context,
  user: User,                // User before deletion
  user_id: string,
  request: HookRequest,
  tenant: { id: string }
}
```

**API Object**:

```typescript
{
  cancel: () => void,        // Blocks the deletion
  token: TokenAPI
}
```

#### `onExecutePostUserDeletion`

Cleanup after user deletion.

**When it runs**: After user is deleted from database

**Synchronous**: No - errors logged but don't affect deletion

**Can modify user**: No (already deleted)

**Event Payload**:

```typescript
{
  ctx: Context,
  user_id: string,
  tenant: { id: string },
  request: HookRequest
}
```

**API Object**:

```typescript
{
  token: TokenAPI;
}
```

## API Objects

### Token API

Available in all hooks:

```typescript
api.token.createServiceToken({
  scope: 'read:users write:users',
  expiresInSeconds: 300,
  customClaims: {                        // Optional custom claims
    'https://my-app.com/role': 'admin',
    tenant_type: 'enterprise'
  }
}): Promise<string>
```

### User API (Pre-Registration, Pre-Update)

```typescript
api.user.setUserMetadata(key: string, value: any): Promise<void>
```

### Redirect API (Post-Login)

```typescript
// Redirect user
api.redirect.sendUserTo(url: string, options?: {
  query?: Record<string, string>
}): void

// Create signed token for redirect
api.redirect.encodeToken({
  secret: string,
  payload: Record<string, any>,
  expiresInSeconds?: number
}): string

// Validate redirect token
api.redirect.validateToken({
  secret: string,
  tokenParameterName?: string
}): Record<string, any> | null
```

### Cancel API (Update/Deletion)

```typescript
api.cancel(): void  // Throws exception to block operation
```

### Deny API (Validation)

```typescript
api.deny(reason?: string): void  // Denies the operation with optional reason
```

## Hook Execution Order Summary

| Hook                                    | When                       | Sync/Async | Can Modify         |
| --------------------------------------- | -------------------------- | ---------- | ------------------ |
| `onExecuteValidateRegistrationUsername` | Identifier page (no user)  | Sync       | N/A                |
| `preUserRegistrationHook`               | Before user creation       | Sync       | No                 |
| `onExecutePreUserRegistration`          | Before user creation       | Sync       | Yes (metadata)     |
| User Created                            | -                          | -          | -                  |
| `onExecutePostUserRegistration`         | After user creation        | Async      | No                 |
| `postUserRegistrationWebhook`           | After user creation        | Async      | No                 |
| `onExecutePostLogin`                    | After authentication       | Sync       | Yes (flow)         |
| Post-Login Forms/Pages                  | After `onExecutePostLogin` | Sync       | Yes (collect data) |
| Post-Login Webhooks                     | After authentication       | Async      | No                 |
| `onExecutePreUserUpdate`                | Before update              | Sync       | Yes                |
| User Updated                            | -                          | -          | -                  |
| `onExecutePreUserDeletion`              | Before deletion            | Sync       | No                 |
| User Deleted                            | -                          | -          | -                  |
| `onExecutePostUserDeletion`             | After deletion             | Async      | No                 |

## Code Executors

In addition to code-based hooks defined at initialization time, AuthHero supports **user-authored code hooks** — code stored in the database and executed at runtime via the Management API. These are managed through the Actions and Hook Code APIs.

To execute user-authored code safely, AuthHero uses a **Code Executor** — a pluggable runtime that sandboxes untrusted code. The executor uses a **recording proxy pattern**: user code calls API methods (e.g., `api.accessToken.setCustomClaim()`), those calls are recorded, and then replayed against the real API objects on the server side.

### Available Executors

#### `LocalCodeExecutor`

Uses `new Function()` to run code inline. No isolation or sandboxing — suitable for **local development only**.

```typescript
import { init, LocalCodeExecutor } from "authhero";

const { app } = init({
  dataAdapter,
  codeExecutor: new LocalCodeExecutor(),
});
```

#### `CloudflareCodeExecutor`

Uses [Cloudflare Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/) to spin up isolated Workers on demand. Each hook execution runs in its own sandboxed Worker with **no network access** (`globalOutbound: null`).

Workers are cached by `hookCodeId` + code hash via `env.LOADER.get()`, so the same code stays warm across requests while code updates automatically get a fresh Worker.

**Wrangler configuration:**

```toml
[[worker_loaders]]
binding = "LOADER"
```

**Usage:**

```typescript
import { init, CloudflareCodeExecutor } from "authhero";

const { app } = init({
  dataAdapter,
  codeExecutor: new CloudflareCodeExecutor({
    loader: env.LOADER,
  }),
});
```

### User Code Format

User-authored code hooks use `exports.onExecuteXxx` functions:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  if (event.user.email.endsWith("@vip.com")) {
    api.accessToken.setCustomClaim("vip", true);
  }
};
```

Supported triggers and their export names:

| Trigger | Export Function |
|---------|----------------|
| `post-user-login` | `exports.onExecutePostLogin` |
| `credentials-exchange` | `exports.onExecuteCredentialsExchange` |
| `pre-user-registration` | `exports.onExecutePreUserRegistration` |
| `post-user-registration` | `exports.onExecutePostUserRegistration` |

### Management API

Code hooks are managed through two API endpoints:

**Hook Code** — stores the code itself:

```bash
# Create hook code
POST /api/v2/hook-code
{ "code": "exports.onExecutePostLogin = async (event, api) => { ... }" }

# Update hook code (triggers re-deploy if executor supports it)
PUT /api/v2/hook-code/{id}
{ "code": "exports.onExecutePostLogin = async (event, api) => { ... }" }
```

**Hooks** — binds code to a trigger:

```bash
# Create a code hook bound to a trigger
POST /api/v2/hooks
{
  "name": "VIP Claims",
  "trigger_id": "post-user-login",
  "code_id": "hc_abc123",
  "enabled": true
}
```

## Best Practices

1. **Keep hooks fast**: Hooks run in the critical authentication path
2. **Handle errors gracefully**: Failed async hooks are logged but may not block flows
3. **Use appropriate hook types**:
   - Code hooks for synchronous logic
   - Webhooks for async notifications
   - Form/Page hooks for user interaction
4. **Test thoroughly**: Hooks can significantly impact authentication behavior
5. **Monitor hook execution**: Check logs for hook failures
6. **Use token API for external calls**: Create service tokens for authenticated API requests
7. **Be careful with cancellation**: Only cancel operations when absolutely necessary
8. **Validate early**: Use `onExecuteValidateRegistrationUsername` for early validation before creating users

## Debugging

Hooks log failures to the tenant's log stream with type `FAILED_HOOK`. Check logs for:

- Hook execution errors
- Webhook invocation failures
- Form/page redirect issues

Example log entry:

```json
{
  "type": "failed_hook",
  "description": "Post user registration hook failed",
  "user_id": "auth0|123",
  "date": "2025-11-04T10:30:00.000Z"
}
```

## Common Use Cases

### Block signups from certain domains

```typescript

```

## Common Use Cases

### Block signups from certain domains

```typescript
onExecuteValidateRegistrationUsername: async (event, api) => {
  const blockedDomains = ["tempmail.com", "disposable.com"];
  const domain = event.user.email.split("@")[1];

  if (blockedDomains.includes(domain)) {
    api.deny("Signups from disposable email providers are not allowed");
  }
};
```

````
```

### Enrich user profile on registration

```typescript
onExecutePreUserRegistration: async (event, api) => {
  await api.user.setUserMetadata("signup_date", new Date().toISOString());
  await api.user.setUserMetadata("signup_ip", event.request.ip);
  await api.user.setUserMetadata(
    "signup_country",
    event.request.geoip?.countryCode,
  );
};
```

### Require MFA for admin users

```typescript
onExecutePostLogin: async (event, api) => {
  const isAdmin = event.authorization.roles.includes("admin");
  const hasMFA = event.authentication.methods.some((m) => m.name === "mfa");

  if (isAdmin && !hasMFA) {
    api.prompt.render("mfa-enrollment-form");
  }
};
```

### Prevent email changes for certain users

```typescript
onExecutePreUserUpdate: async (event, api) => {
  if (event.updates.email && event.user.app_metadata?.email_locked) {
    api.cancel();
  }
};
```

### Send notification on user deletion

```typescript
onExecutePostUserDeletion: async (event, api) => {
  const token = await api.token.createServiceToken({
    scope: "send:notifications",
    expiresInSeconds: 60,
  });

  await fetch("https://api.example.com/notifications", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "user_deleted",
      user_id: event.user_id,
    }),
  });
};
```
````
