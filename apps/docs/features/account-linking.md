---
title: Account Management
description: Guide to the self-service account management page where users can edit their profile, manage linked accounts, configure 2FA, and delete their account.
---

# Account Management

AuthHero provides a self-service account management page where authenticated users can manage their own account. The page is served at `/u2/account` and uses the same widget-based UI as the login screens.

## Features

| Feature | Route | Description |
|---------|-------|-------------|
| Account hub | `/u2/account` | Overview of profile, MFA, and linked accounts |
| Edit profile | `/u2/account/profile` | Update name, phone, picture |
| Security settings | `/u2/account/security` | View and remove MFA enrollments |
| Linked accounts | `/u2/account/linked` | View and unlink linked identities |
| Delete account | `/u2/account/delete` | Permanently delete the account |

## Opening the Account Page

The account page requires an authenticated session. To redirect a user to their account page, use the `/account` endpoint with a `client_id`:

```
GET /account?client_id=YOUR_CLIENT_ID
```

If the user has a valid session cookie, they are redirected to `/u2/account`. If not, they are sent through the login flow first and redirected to the account page after authentication.

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `client_id` | Yes | The application's client ID |
| `redirect_url` | No | URL to redirect to after the user is done |
| `login_hint` | No | Pre-fill the email field if login is required |
| `screen_hint` | No | Jump to a specific screen: `account`, `change-email`, `change-phone`, `change-password` |

### Example: Link from Your App

```html
<a href="https://auth.example.com/account?client_id=abc123&redirect_url=https://app.example.com">
  Manage Account
</a>
```

## Edit Profile

The profile screen at `/u2/account/profile` lets users update:

- **First name** and **Last name**
- **Nickname**
- **Phone number**
- **Profile picture URL**

Changes are saved via the user adapter's `update` method. The `name` field is automatically derived from the first and last name.

## Linked Accounts

The linked accounts screen at `/u2/account/linked` shows all identities linked to the user's primary account. Each linked identity displays the provider name (e.g., Google, GitHub) and the associated email.

Users can unlink any non-primary identity. Unlinking removes the association but does not delete the linked account itself.

For more details on how account linking works, see the [Account Linking](/auth0-comparison/account-linking) documentation.

## Two-Factor Authentication Management

The security screen at `/u2/account/security` lists all confirmed MFA enrollments for the user. Each enrollment shows:

- The method type (Authenticator App, Phone SMS, Email, etc.)
- The phone number (for phone-based methods)
- The date it was added

Users can remove individual MFA enrollments. If all enrollments are removed, the user will be prompted to enroll again on their next login (if MFA is required by the tenant's policy).

For setting up MFA on a tenant, see the [MFA Setup Guide](/features/mfa).

## Delete Account

The delete screen at `/u2/account/delete` allows users to permanently delete their account. This action:

1. Requires the user to type "DELETE" as confirmation
2. Revokes the current session
3. Removes the user and all associated data (linked accounts, MFA enrollments, etc.)
4. Redirects to the application's redirect URL

::: warning
Account deletion is permanent and cannot be undone. All user data, linked identities, and MFA enrollments are removed.
:::

## Session Requirements

All account screens require a valid authenticated session. The session is read from the tenant-scoped auth cookie. If the session is expired or revoked, the user is redirected to the login page.

The account page operates within a login session created by the `/account` entry point. This session carries the `client_id`, `redirect_uri`, and other OAuth parameters needed to redirect the user back to the application when they are done.

## Customization

The account screens use the same widget and theming system as the login screens. Branding (logo, colors, fonts) and theme settings configured for your tenant are automatically applied.

Custom text overrides can be applied using the `common` prompt screen in the [Custom Text API](/api/endpoints#custom-text).
