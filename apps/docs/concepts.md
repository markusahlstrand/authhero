# Key Concepts in AuthHero

This document explains the core concepts and terminology used in AuthHero.

## Tenants

In AuthHero, a tenant represents a logical isolation of users, applications, and authentication settings. Multi-tenancy allows you to manage multiple authentication domains within a single AuthHero instance.

## Applications

Applications represent client applications that use AuthHero for authentication. Each application has its own settings, redirect URIs, and other configuration options.

## Connections

Connections are authentication methods available to users, such as username/password, social logins, or enterprise connections like SAML or LDAP.

### SAML Connections

SAML (Security Assertion Markup Language) is an enterprise authentication standard that enables single sign-on (SSO) between an identity provider (IdP) and service providers (SP). AuthHero acts as an identity provider and supports:

- **SAML Request Parsing** - Parse authentication requests from service providers
- **SAML Response Generation** - Create signed SAML responses with user attributes
- **SAML Metadata** - Provide metadata for service provider configuration
- **Flexible Signing** - Support for both local signing (Node.js) and HTTP-based signing (edge environments)

SAML connections are particularly useful for enterprise customers who need to integrate with existing identity management systems or provide SSO to third-party applications.

[Learn more about SAML →](/packages/saml/)

## Domains

Domains represent the URLs where your authentication pages are hosted. AuthHero supports custom domains for a branded authentication experience.

## Users

Users are the individuals who authenticate through AuthHero. Each user belongs to one or more tenants and can have different attributes and permissions.

### Account Linking

Account linking allows a single user to have multiple authentication identities (connections) consolidated into one user profile. This is useful when:

- A user signs up with email/password and later wants to link a social login
- A user has multiple email addresses they want to use with the same account
- You want to consolidate user accounts that represent the same person

**Primary and Secondary Accounts:**

When accounts are linked:

- One account becomes the **primary account** - this is the main user profile
- Other accounts become **secondary (linked) accounts** - these are attached as additional identities

**Updating Linked Accounts:**

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

**Important Limitations:**

- You cannot directly update a linked (secondary) account - all updates must go through the primary account
- Password updates on linked accounts are only supported for `Username-Password-Authentication` connections
- Attempting to update a linked account directly (via its own user_id) will return a 404 error

**Querying Linked Accounts:**

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

## Organizations

Organizations enable you to group users and apply specific configurations, branding, and access controls to them. Organizations are useful for B2B applications where you serve multiple customer companies.

### Organization Invitations

Organization invitations provide a streamlined way to onboard new users to an organization. When you create an invitation, you can:

- **Pre-configure user attributes**: Set roles, app metadata, and user metadata before the user accepts
- **Control the connection**: Specify which authentication method the user should use
- **Set expiration**: Invitations expire after a configurable time period (default: 7 days, max: 30 days)
- **Track the inviter**: Record who sent the invitation for auditing purposes

**Invitation Flow:**

1. An admin creates an invitation through the Management API
2. An invitation URL is generated with a unique ticket
3. The invitee receives the invitation (optionally via email)
4. The invitee clicks the invitation URL and completes the signup/login flow
5. Upon completion, the user is automatically added to the organization with the pre-configured settings

**Key Properties:**

- `inviter`: Information about who sent the invitation
- `invitee`: Email address of the person being invited
- `client_id`: The application the user will access
- `connection_id`: Optional specific authentication connection
- `roles`: Role IDs to assign to the user
- `app_metadata` / `user_metadata`: Custom data to attach to the user
- `ttl_sec`: Time-to-live in seconds before the invitation expires
- `send_invitation_email`: Whether to automatically send an invitation email

[Learn more about Organization Invitations API →](/api/endpoints#organization-invitations)

## Tokens

AuthHero generates various types of tokens during the authentication process:

- **ID Tokens**: Contain user identity information
- **Access Tokens**: Grant access to protected resources
- **Refresh Tokens**: Allow obtaining new access tokens without re-authentication

## Logs

AuthHero logs authentication events and other activities, providing an audit trail of what happened in your authentication system.

## Universal Login Flow

The authentication flow uses a universal login system:

1. Users are directed to a login page
2. Authentication can be via password, code, or social providers
3. Upon successful authentication, users receive a session
4. The session is tenant-specific

## Hooks

Hooks are a powerful extensibility mechanism that allows you to customize the authentication and user lifecycle at various points. AuthHero supports both URL-based webhooks and programmatic hooks defined in code.

### Types of Hooks

**Programmatic Hooks**: Defined directly in your application code during initialization. These provide synchronous, server-side customization capabilities:

- `onExecutePreUserRegistration` - Before a user is created
- `onExecutePostUserRegistration` - After a user is created
- `onExecutePreUserUpdate` - Before a user is updated
- `onExecutePreUserDeletion` - Before a user is deleted (AuthHero-specific)
- `onExecutePostUserDeletion` - After a user is deleted (AuthHero-specific)
- `onExecutePostLogin` - After successful authentication
- `onExecuteCredentialsExchange` - Before tokens are issued

**URL Hooks**: Configured through the Management API to call external webhooks at specific trigger points.

**Form Hooks**: Unique to AuthHero, these render custom forms within the authentication flow for progressive profiling or consent gathering.

### Key Differences from Auth0

- **User Deletion Hooks**: AuthHero provides both pre and post deletion hooks, which Auth0 doesn't offer natively
- **Form Hooks**: AuthHero can render custom forms directly in the authentication flow
- **Continued Support**: While Auth0 deprecated their legacy Hooks in 2024, AuthHero continues to support and expand this functionality

[Learn more about Hooks →](/auth0-comparison/hooks)
