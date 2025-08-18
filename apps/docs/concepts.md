# Key Concepts in AuthHero

This document explains the core concepts and terminology used in AuthHero.

## Tenants

In AuthHero, a tenant represents a logical isolation of users, applications, and authentication settings. Multi-tenancy allows you to manage multiple authentication domains within a single AuthHero instance.

## Applications

Applications represent client applications that use AuthHero for authentication. Each application has its own settings, redirect URIs, and other configuration options.

## Connections

Connections are authentication methods available to users, such as username/password, social logins, or enterprise connections like SAML or LDAP.

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
