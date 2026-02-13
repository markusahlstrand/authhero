---
title: Account Linking
description: Compare account linking in AuthHero vs Auth0. Learn how AuthHero provides automatic email-based account linking and manual control via hooks.
---

# Account Linking: AuthHero vs. Auth0

Account linking allows multiple authentication identities (e.g., email/password, Google, Facebook) to be associated with a single user profile. This is essential for providing a seamless user experience when users sign in through different methods.

## Quick Comparison

| Feature                         | Auth0                                      | AuthHero                              |
| ------------------------------- | ------------------------------------------ | ------------------------------------- |
| **Automatic Email Linking**     | ❌ Requires custom Action                  | ✅ Built-in                           |
| **Manual Linking via Hook**     | Requires Management API calls              | ✅ Simple `setLinkedTo()` API         |
| **Cross-Connection Linking**    | Complex setup required                     | ✅ Automatic when emails match        |
| **Primary User Selection**      | Manual implementation                      | ✅ Automatic (first verified account) |
| **Chain Linking Prevention**    | Manual implementation                      | ✅ Built-in                           |
| **Tenant Isolation**            | N/A (single tenant)                        | ✅ Automatic per-tenant               |
| **Case-Insensitive Matching**   | Manual implementation                      | ✅ Built-in                           |

## The Problem with Auth0 Account Linking

In Auth0, account linking requires significant custom implementation:

### 1. Manual Action Implementation

You need to create a custom Action that:
- Searches for existing users with matching emails
- Calls the Management API to link accounts
- Handles token refresh for API calls
- Manages edge cases and errors

```javascript
// Auth0 Action (complex implementation)
exports.onExecutePostLogin = async (event, api) => {
  const ManagementClient = require('auth0').ManagementClient;
  
  // Need to create Management API client
  const management = new ManagementClient({
    domain: event.secrets.domain,
    clientId: event.secrets.clientId,
    clientSecret: event.secrets.clientSecret,
  });

  // Search for existing users
  const users = await management.getUsersByEmail(event.user.email);
  
  // Complex logic to find primary account
  const primaryUser = users.find(u => u.user_id !== event.user.user_id);
  
  if (primaryUser) {
    // Manual linking via API call
    await management.linkUsers(primaryUser.user_id, {
      user_id: event.user.user_id,
      provider: event.connection.strategy,
    });
  }
};
```

### 2. Common Issues with Auth0 Approach

- **Race conditions**: Multiple simultaneous logins can create duplicate users
- **Token management**: Management API tokens need refresh handling
- **Error recovery**: Failed linking leaves orphan accounts
- **No pre-registration hook**: Linking happens after user creation, not during

## AuthHero's Built-in Account Linking

AuthHero handles account linking automatically and provides simple hooks for custom control.

### Automatic Email-Based Linking

When a new user signs up with a verified email that matches an existing user, AuthHero automatically links the accounts:

```typescript
// This happens automatically in AuthHero!
// No custom code required for basic email-based linking

// Example: User signs in with Google
// 1. Google returns verified email: user@example.com
// 2. AuthHero finds existing user with same email
// 3. New identity automatically linked to existing primary user
// 4. Login returns the primary user with both identities
```

### Requirements for Automatic Linking

Account linking occurs automatically when **all** of these conditions are met:

1. ✅ The new account has a **verified email**
2. ✅ An existing account has the **same email** (case-insensitive)
3. ✅ Both accounts are in the **same tenant**

::: warning Email Verification Required
Unverified emails are **never** automatically linked. This prevents account takeover attacks where an attacker could claim any email address.
:::

### Manual Linking via Hooks

For advanced use cases, AuthHero provides the `setLinkedTo()` method in the pre-registration hook:

```typescript
import { init } from "@authhero/authhero";

const auth = init({
  dataAdapter: myAdapter,
  hooks: {
    onExecutePreUserRegistration: async (event, api) => {
      // Link to a specific user regardless of email
      const targetUserId = await lookupUserInExternalSystem(event.user.email);
      
      if (targetUserId) {
        api.user.setLinkedTo(targetUserId);
      }
    },
  },
});
```

### Use Cases for Manual Linking

1. **Migration from Another System**: Link users based on external IDs
2. **Organization-Based Linking**: Link users within the same organization
3. **Custom Matching Logic**: Link based on phone number or other attributes
4. **Override Automatic Linking**: Link to a different user than email would suggest

## How Account Linking Works

### Data Model

In AuthHero, linked accounts have a `linked_to` field pointing to the primary user:

```
Primary User: auth0|user123
├── email: user@example.com
├── linked_to: null (primary users have no linked_to)
└── identities: [
      { provider: "auth0", user_id: "user123" },
      { provider: "google-oauth2", user_id: "google456" },
      { provider: "facebook", user_id: "fb789" }
    ]

Secondary User: google-oauth2|google456
├── email: user@example.com
├── linked_to: "auth0|user123"  ← Points to primary
└── identities: (included in primary's identities)
```

### Login Behavior

When a user logs in with a linked account:

1. AuthHero identifies the linked identity
2. The **primary user** is returned (not the secondary)
3. All identities are included in the `identities` array
4. Tokens are issued for the primary user's `user_id`

### Chain Linking Prevention

AuthHero automatically prevents chain linking. New accounts always link to the **primary** user, never to another secondary:

```
✅ Correct:
  Primary ← Secondary1
  Primary ← Secondary2
  Primary ← Secondary3

❌ Prevented (chain linking):
  Primary ← Secondary1 ← Secondary2 ← Secondary3
```

## Example: Complete Hook Implementation

Here's a comprehensive example showing various account linking scenarios:

```typescript
import { init } from "@authhero/authhero";

const auth = init({
  dataAdapter: myAdapter,
  hooks: {
    onExecutePreUserRegistration: async (event, api) => {
      // Example 1: Link based on external CRM ID
      const crmUser = await lookupCRM(event.user.email);
      if (crmUser?.authhero_user_id) {
        api.user.setLinkedTo(crmUser.authhero_user_id);
        return;
      }

      // Example 2: Link employees to company account
      if (event.user.email?.endsWith("@mycompany.com")) {
        const companyPrimaryUser = await findCompanyPrimaryUser(event.user.email);
        if (companyPrimaryUser) {
          api.user.setLinkedTo(companyPrimaryUser.user_id);
          return;
        }
      }

      // Example 3: Block linking for certain domains
      if (event.user.email?.endsWith("@blocked-domain.com")) {
        // Don't set linked_to - user will be created as separate account
        // even if email matches (overrides automatic linking)
        api.user.setUserMetadata("linking_blocked", true);
        return;
      }

      // For all other cases, automatic email-based linking applies
    },
  },
});
```

## Security Considerations

### Built-in Protections

AuthHero includes several security measures for account linking:

| Protection                  | Description                                                    |
| --------------------------- | -------------------------------------------------------------- |
| **Email Verification**      | Only verified emails trigger automatic linking                 |
| **Tenant Isolation**        | Users can only be linked within the same tenant                |
| **Primary User Validation** | `setLinkedTo()` validates the target user exists               |
| **No Chain Linking**        | Secondary accounts cannot link to other secondary accounts     |
| **Case Normalization**      | Emails are compared case-insensitively to prevent bypasses     |

### When NOT to Link

Automatic linking is skipped when:

- Email is not verified
- User has no email (e.g., SMS-only authentication)
- No matching user exists in the same tenant
- `linked_to` is explicitly set via hook (takes precedence)

## Migration from Auth0

If you're migrating from Auth0 and have custom account linking logic:

### 1. Remove Auth0 Actions

You can typically remove your Auth0 account linking Actions entirely, as AuthHero handles this automatically.

### 2. Migrate Existing Links

Export linked accounts from Auth0 and import with `linked_to` set:

```typescript
// Migration script
for (const auth0User of auth0Users) {
  if (auth0User.identities.length > 1) {
    // Primary user
    const primaryUserId = `${auth0User.identities[0].provider}|${auth0User.identities[0].user_id}`;
    
    await authHero.users.create({
      ...auth0User,
      user_id: primaryUserId,
      linked_to: undefined, // Primary users have no linked_to
    });
    
    // Secondary identities
    for (const identity of auth0User.identities.slice(1)) {
      await authHero.users.create({
        email: auth0User.email,
        user_id: `${identity.provider}|${identity.user_id}`,
        linked_to: primaryUserId,
        // ... other fields
      });
    }
  }
}
```

### 3. Implement Custom Logic (if needed)

Only if you had special linking logic beyond email matching:

```typescript
// Replicate custom Auth0 Action logic
onExecutePreUserRegistration: async (event, api) => {
  // Your custom matching logic here
  const targetUser = await yourCustomLookup(event.user);
  if (targetUser) {
    api.user.setLinkedTo(targetUser.user_id);
  }
}
```

## Summary

AuthHero significantly simplifies account linking compared to Auth0:

| Aspect              | Auth0                     | AuthHero               |
| ------------------- | ------------------------- | ---------------------- |
| **Setup Required**  | Custom Action + API calls | None (built-in)        |
| **Code Complexity** | 50+ lines                 | 0-10 lines             |
| **Error Handling**  | Manual                    | Automatic              |
| **Edge Cases**      | Manual implementation     | Handled automatically  |
| **Customization**   | Complex                   | Simple `setLinkedTo()` |

For most applications, AuthHero's automatic email-based linking works out of the box with no configuration required.
