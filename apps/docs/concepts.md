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
