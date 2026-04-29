---
title: User Creation Flow
description: Complete user creation flow in AuthHero with all hooks triggered during signup including validation, pre-registration, account linking, and post-registration.
---

# User Creation Flow and Hooks

This document describes the complete user creation flow in AuthHero and all hooks that are triggered during the process.

::: tip Pipeline architecture
For the design rationale behind the three-phase (prepare / commit / publish) model, transaction boundaries, and how post-hooks are delivered via the outbox with retries and dead-letter, see the [Hooks & Outbox Pipeline](../architecture/hooks-pipeline.md) architecture doc. The guide below focuses on which hooks fire and in what order.
:::

## Overview

When a new user signs up or is created in AuthHero, whether through email/password, passwordless, social login, or the Management API, a series of validation checks and hooks are executed to ensure proper authorization and data integrity.

Hook execution follows a strict three-phase model:

1. **Prepare** — validation + blocking hooks (pre-registration, pre-update, pre-deletion). Outside any DB transaction so webhook calls and user-authored action code can take unbounded time.
2. **Commit** — one short DB transaction that writes the user + password + outbox event atomically. No external I/O.
3. **Publish** — post-hook dispatch via the outbox (webhooks, finalizers). Retried with exponential backoff; dead-lettered after exhaustion. Self-heals on the user's next login via `registration_completed_at`.

## User Creation Methods

Users can be created through several methods:

1. **Email/Password Signup** - Via `/dbconnections/signup` endpoint
2. **Passwordless (Email/SMS)** - Via `/passwordless/start` endpoint followed by verification
3. **Social Login** - Via OAuth connections (Google, Facebook, etc.)
4. **Management API** - Direct user creation via `/api/v2/users` endpoint

## Signup Validation Flow

### 1. Early Validation (Optional)

Before a user even attempts to sign up, you can validate their eligibility using the `validateRegistrationUsername` function. This is useful for:

- Identifier pages that check if signup is allowed before showing the signup form
- Providing early feedback to users
- Avoiding unnecessary user interactions when signup is disabled

**Function:** `validateRegistrationUsername(ctx, client, data, email)`

**Returns:** `{ allowed: boolean, reason?: string }`

**Checks:**

- Whether `disable_sign_ups` is set to `"true"` in client metadata
- If `screen_hint=signup` is present in authorization URL (overrides the disable setting)
- If another user with the same email exists (allows linking)

### 2. Pre-Registration Hook (Right Before User Creation)

When user creation is attempted through any signup flow (email/password, social, passwordless email), the `preUserRegistrationHook` is executed.

**Function:** `preUserRegistrationHook(ctx, client, data, email)`

**Executed for:**

- ✅ Email/password signups
- ✅ Passwordless email signups
- ✅ Social login signups (Google, Facebook, etc.)
- ❌ Passwordless SMS signups (phone-based, no email validation needed)
- ❌ Management API user creation (no client_id context)

**Note:** SMS/phone-based signups are not subject to email-based signup validation since they don't have an email address. The `disable_sign_ups` client metadata only applies to email-based authentication methods.

**Actions:**

1. Re-validates signup eligibility using `validateRegistrationUsername`
2. Logs failed signup attempts (type: `fs`)
3. Invokes pre-registration webhooks if configured
4. Throws `HTTPException 400` if signup should be blocked

**Bypass Conditions:**

- `screen_hint=signup` is present in the authorization URL
- A user with the same verified email already exists (account linking)

### 3. User Creation Hook

Once the pre-registration hook passes, the actual user creation begins through `data.users.create`. This triggers additional hooks through `createUserHooks`.

**Actions:**

1. Validates client_id exists in context (auth flows only)
2. Fetches client configuration
3. Executes `preUserRegistrationHook` (for auth flows with client_id)
4. Invokes `onExecutePreUserRegistration` (programmatic hook)
5. Resolves the effective `userLinkingMode` (per-client → service-level)
6. Commits the user via `commitUserHook` — when the resolved mode allows it, the email→primary lookup runs inside the same transaction; otherwise the lookup is skipped and only the row is committed
7. Invokes `onExecutePostUserRegistration` (programmatic hook)
8. Dispatches enabled `post-user-registration` template hooks (e.g. `account-linking`)
9. Invokes post-user-registration webhooks

## Complete Hook Execution Order

When a new user signs up through an authentication flow:

```
PHASE 1 — Prepare (no DB transaction held)

1. validateRegistrationUsername (optional, early check)
   ↓
2. preUserRegistrationHook
   ├── validateRegistrationUsername (re-validation)
   ├── Log failed signup (if blocked)
   └── preUserRegistrationWebhook  ◀── HTTP, can take seconds
   ↓
3. onExecutePreUserRegistration (programmatic hook)
   ↓
4. pre-user-registration code hooks (Cloudflare Dispatch)

PHASE 2 — Commit (single short DB transaction)

5. commitUserHook
   ├── (optional) getPrimaryUserByEmail — only if userLinkingMode resolves
   │   to "builtin" for the current client/tenant
   ├── users.rawCreate (bypasses the decorator; no hook re-entry)
   └── linked_to resolution if a primary was found

PHASE 3 — Publish (runs after the commit, never blocks it)

6. onExecutePostUserRegistration (programmatic, inline for now)
7. post-user-registration code hooks (inline for now — see roadmap)
8. post-user-registration template hooks (e.g. account-linking)
   └── pre-defined function dispatched by template_id; not user code
9. enqueuePostHookEvent("post-user-registration")
   └── outbox relay → WebhookDestination + RegistrationFinalizerDestination
       ├── POSTs to enabled webhooks with Idempotency-Key = event.id
       ├── retries with exponential backoff on failure (max 5)
       ├── moves to dead-letter after retry exhaustion
       └── on success → sets user.registration_completed_at
```

Self-healing: if `registration_completed_at` is still `null` on the user's next login, `postUserLoginHook` re-enqueues the `post-user-registration` event so a dead-lettered or lost delivery recovers automatically. Webhook consumers must be idempotent (enforced by the `Idempotency-Key` header).

## Signup Blocking with `disable_sign_ups`

### Configuration

Set the `disable_sign_ups` client metadata to `"true"` to block public signups:

```json
{
  "client_metadata": {
    "disable_sign_ups": "true"
  }
}
```

### Behavior

When `disable_sign_ups` is enabled:

**❌ Blocked:**

- New signups via email/password
- New signups via passwordless email
- New signups via social logins (Google, Facebook, etc.)

**✅ Allowed:**

- Signups via SMS/phone (not email-based, so not restricted)
- Signups when `screen_hint=signup` is in the authorization URL (e.g., for invited users)
- Signups when a user with the same verified email already exists (account linking)
- User creation via Management API (admin operations bypass signup restrictions)
- Login attempts for existing users

**Important:** The `disable_sign_ups` setting only applies to **email-based** authentication methods. SMS/phone-based signups are not restricted because they don't use email addresses and follow a different validation flow.

### Use Cases

1. **Invite-Only Applications**
   - Block public signups but allow invited users via `screen_hint=signup`
2. **Account Linking**
   - User signs up with email/password
   - Later tries to sign in with Google using the same email
   - Google account is automatically linked to existing account even with `disable_sign_ups: true`

3. **Gradual Rollout**
   - Start with closed beta (signups disabled)
   - Send invitation links with `screen_hint=signup`
   - Open to public later by removing the flag

## Hook Types

### URL/Form Hooks (Management API)

Configured via the Management API and support the following triggers:

- `pre-user-registration` - Before user creation
- `post-user-registration` - After successful creation
- `post-user-login` - After successful login
- `validate-registration-username` - Validate registration eligibility
- `pre-user-deletion` - Before user deletion
- `post-user-deletion` - After user deletion

### Programmatic Hooks (Application Config)

Defined in your application code when initializing AuthHero:

```typescript
const hooks = {
  onExecutePreUserRegistration: async (event, api) => {
    // Modify user metadata before creation
    api.user.setUserMetadata("source", "web");
  },
  onExecutePostUserRegistration: async (event, api) => {
    // Perform actions after user is created
    await sendWelcomeEmail(event.user.email);
  },
};
```

## Management API User Creation

When creating users through the Management API (`POST /api/v2/users`):

**Differences:**

- No `client_id` in context
- Pre-signup hooks are **skipped** (no client-specific validation)
- Account linking hooks still execute
- Post-registration hooks still execute
- Intended for administrative operations

**Rationale:** Management API operations are admin-initiated and bypass client-specific signup restrictions.

## Best Practices

1. **Use `validateRegistrationUsername` early** - Check eligibility before showing signup forms
2. **Log blocked signups** - Monitor failed signup attempts for security
3. **Test with different methods** - Verify that all signup methods respect `disable_sign_ups`
4. **Use `screen_hint=signup`** - For invitation flows and onboarding
5. **Monitor account linking** - Ensure users with same email are properly linked

````

## Error Messages

When signup is blocked, users see:

- HTTP 400 status
- Message: "Public signup is disabled for this client" (or custom reason)
- Log entry with type `fs` (failed signup)

## Examples

### Example 1: Blocking Social Login Signups

```typescript
// 1. Configure client
await clients.update("tenant-id", "client-id", {
  client_metadata: {
    disable_sign_ups: "true",
  },
});

// 2. User tries to sign up with Google
// Result: HTTP 400 - "Public signup is disabled for this client"

// 3. Existing user tries to log in with Google
// Result: Success - login proceeds normally
````

### Example 2: Invite-Only Application

```typescript
// 1. Disable public signups
await clients.update("tenant-id", "client-id", {
  client_metadata: {
    disable_sign_ups: "true",
  },
});

// 2. Send invitation with screen_hint
const inviteUrl =
  `https://your-domain/authorize?` +
  `screen_hint=signup&` +
  `client_id=client-id&` +
  `redirect_uri=https://your-app/callback`;

// 3. User clicks invite link and signs up
// Result: Success - allowed via screen_hint=signup
```

### Example 3: Account Linking

```typescript
// 1. User signs up with email/password
await fetch("/dbconnections/signup", {
  method: "POST",
  body: JSON.stringify({
    email: "user@example.com",
    password: "SecurePass123!",
    connection: "Username-Password-Authentication",
    client_id: "client-id",
  }),
});

// 2. Later, disable public signups
await clients.update("tenant-id", "client-id", {
  client_metadata: {
    disable_sign_ups: "true",
  },
});

// 3. User tries to log in with Google (same email)
// Result: Success - Google account is linked to existing account
// Reason: Account linking is allowed even when signups are disabled
```

## Related Documentation

- [Hooks: AuthHero vs. Auth0](../auth0-comparison/hooks.md)
