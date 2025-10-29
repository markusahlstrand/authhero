# User Creation Flow and Hooks

This document describes the complete user creation flow in AuthHero and all hooks that are triggered during the process.

## Overview

When a new user signs up or is created in AuthHero, whether through email/password, passwordless, social login, or the Management API, a series of validation checks and hooks are executed to ensure proper authorization and data integrity.

## User Creation Methods

Users can be created through several methods:

1. **Email/Password Signup** - Via `/dbconnections/signup` endpoint
2. **Passwordless (Email/SMS)** - Via `/passwordless/start` endpoint followed by verification
3. **Social Login** - Via OAuth connections (Google, Facebook, etc.)
4. **Management API** - Direct user creation via `/api/v2/users` endpoint

## Signup Validation Flow

### 1. Early Validation (Optional)

Before a user even attempts to sign up, you can validate their eligibility using the `validateSignupEmail` function. This is useful for:

- Identifier pages that check if signup is allowed before showing the signup form
- Providing early feedback to users
- Avoiding unnecessary user interactions when signup is disabled

**Function:** `validateSignupEmail(ctx, client, data, email)`

**Returns:** `{ allowed: boolean, reason?: string }`

**Checks:**

- Whether `disable_sign_ups` is set to `"true"` in client metadata
- If `screen_hint=signup` is present in authorization URL (overrides the disable setting)
- If another user with the same email exists (allows linking)

### 2. Pre-Signup Hook (Right Before User Creation)

When user creation is attempted through any signup flow (email/password, social, passwordless email), the `preUserSignupHook` is executed.

**Function:** `preUserSignupHook(ctx, client, data, email)`

**Executed for:**

- ✅ Email/password signups
- ✅ Passwordless email signups
- ✅ Social login signups (Google, Facebook, etc.)
- ❌ Passwordless SMS signups (phone-based, no email validation needed)
- ❌ Management API user creation (no client_id context)

**Note:** SMS/phone-based signups are not subject to email-based signup validation since they don't have an email address. The `disable_sign_ups` client metadata only applies to email-based authentication methods.

**Actions:**

1. Re-validates signup eligibility using `validateSignupEmail`
2. Logs failed signup attempts (type: `fs`)
3. Invokes pre-signup webhooks if configured
4. Throws `HTTPException 400` if signup should be blocked

**Bypass Conditions:**

- `screen_hint=signup` is present in the authorization URL
- A user with the same verified email already exists (account linking)

### 3. User Creation Hook

Once the pre-signup hook passes, the actual user creation begins through `data.users.create`. This triggers additional hooks through `createUserHooks`.

**Actions:**

1. Validates client_id exists in context (auth flows only)
2. Fetches client configuration
3. Executes `preUserSignupHook` (for auth flows with client_id)
4. Invokes `onExecutePreUserRegistration` (programmatic hook)
5. Performs account linking if applicable via `linkUsersHook`
6. Invokes `onExecutePostUserRegistration` (programmatic hook)
7. Invokes post-user-registration webhooks

## Complete Hook Execution Order

When a new user signs up through an authentication flow:

```
1. validateSignupEmail (optional, early check)
   ↓
2. preUserSignupHook
   ├── validateSignupEmail (re-validation)
   ├── Log failed signup (if blocked)
   └── preUserSignupWebhook
   ↓
3. data.users.create (wrapped with hooks)
   ├── Validate client_id and fetch client
   ├── preUserSignupHook (redundant check, already done)
   ├── onExecutePreUserRegistration (programmatic)
   ├── linkUsersHook (automatic account linking)
   ├── onExecutePostUserRegistration (programmatic)
   └── postUserRegistrationWebhook
```

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

- `pre-user-signup` - Before user creation
- `post-user-registration` - After successful creation
- `post-user-login` - After successful login

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

1. **Use `validateSignupEmail` early** - Check eligibility before showing signup forms
2. **Log blocked signups** - Monitor failed signup attempts for security
3. **Test with different methods** - Verify that all signup methods respect `disable_sign_ups`
4. **Use `screen_hint=signup`** - For invitation flows and onboarding
5. **Monitor account linking** - Ensure users with same email are properly linked

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
```

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
