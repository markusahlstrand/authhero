---
title: Authentication Flow
description: Understand AuthHero's OAuth 2.0 / OpenID Connect authentication flow including login, token types (ID, access, refresh), and session management.
---

# Authentication Flow

This guide explains the authentication flow in AuthHero, covering login, registration, token handling, and session management.

## Overview

AuthHero implements a standard OAuth 2.0 / OpenID Connect authentication flow, with support for various grant types and authentication methods.

## Login Flow

1. User initiates login at the client application
2. Client redirects to AuthHero login page
3. User enters credentials
4. AuthHero validates credentials
5. On success, AuthHero issues tokens and redirects back to the client application

## Token Types

AuthHero issues several types of tokens:

- **ID Token**: Contains user identity information (JWT format)
- **Access Token**: Grants access to protected resources (JWT format)
- **Refresh Token**: Allows obtaining new access tokens without re-authentication

## Token Verification

[Token verification process will be documented here]

## Refresh Token Flow

Refresh tokens allow your application to obtain new access tokens without requiring the user to re-authenticate.

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=REFRESH_TOKEN&
client_id=CLIENT_ID&
client_secret=CLIENT_SECRET
```

The response includes a new access token (and optionally an ID token if `openid` scope was requested).

### Organization Switching

When working with [organizations](/entities/identity/organizations), you can switch the organization context during a refresh token exchange by passing the `organization` parameter:

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=REFRESH_TOKEN&
client_id=CLIENT_ID&
organization=ORG_ID_OR_NAME
```

This enables seamless organization switching in multi-tenant applications without requiring the user to log in again. The behavior is:

- **With `organization` parameter**: Tokens are issued for the specified organization. The user must be a member.
- **Without `organization` parameter**: The original organization from the login session is preserved in the new tokens.

See [Tokens](/entities/security/tokens) for details on organization-related token claims.

## Custom Authentication Flows

[Custom authentication flow options will be documented here]

## Security Considerations

[Security best practices will be documented here]
