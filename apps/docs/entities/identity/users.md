---
title: Users
description: Manage users in AuthHero including user properties, metadata, identities, account linking, and querying linked accounts.
---

# Users

Users are the individuals who authenticate through AuthHero. Each user belongs to one or more tenants and can have different attributes and permissions.

## User Properties

Each user has:

- **user_id**: Unique identifier (format: `{connection}|{id}`)
- **email**: Email address
- **email_verified**: Whether the email has been verified
- **name**: Full name
- **nickname**: Display name
- **picture**: Profile picture URL
- **user_metadata**: Custom data editable by the user
- **app_metadata**: Custom data editable by administrators only
- **identities**: Array of linked authentication identities

## Account Linking

Account linking allows a single user to have multiple authentication identities (connections) consolidated into one user profile. This is useful when:

- A user signs up with email/password and later wants to link a social login
- A user has multiple email addresses they want to use with the same account
- You want to consolidate user accounts that represent the same person

### Primary and Secondary Accounts

When accounts are linked:

- One account becomes the **primary account** - this is the main user profile
- Other accounts become **secondary (linked) accounts** - these are attached as additional identities

### Updating Linked Accounts

You can update properties of linked accounts by specifying the `connection` parameter in the user update API:

```json
PATCH /api/v2/users/{primary_user_id}
{
  "phone_number": "+1234567890",
  "connection": "sms"
}
```

Supported operations on linked accounts:

- Update user metadata and app metadata
- Update email verification status
- Update phone numbers (for SMS connections)
- Update passwords (for Username-Password-Authentication connections only)

### Important Limitations

- You cannot directly update a linked (secondary) account - all updates must go through the primary account
- Password updates on linked accounts are only supported for `Username-Password-Authentication` connections
- Attempting to update a linked account directly (via its own user_id) will return a 404 error

### Querying Linked Accounts

When retrieving a primary user, all linked identities are included in the `identities` array:

```json
{
  "user_id": "email|primary-user",
  "email": "user@example.com",
  "identities": [
    {
      "provider": "email",
      "user_id": "primary-user",
      "connection": "email",
      "isSocial": false
    },
    {
      "provider": "sms",
      "user_id": "secondary-user",
      "connection": "sms",
      "isSocial": false,
      "profileData": {
        "phone_number": "+1234567890"
      }
    }
  ]
}
```

## API Reference

- [GET /api/v2/users](/api/endpoints#get-users)
- [POST /api/v2/users](/api/endpoints#create-user)
- [PATCH /api/v2/users/:id](/api/endpoints#update-user)
- [DELETE /api/v2/users/:id](/api/endpoints#delete-user)
- [POST /api/v2/users/:id/identities](/api/endpoints#link-user-account)
