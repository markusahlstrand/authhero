---
title: AuthHero API Reference
description: API reference for the AuthHero library including authentication methods (login, signup) and token methods (validate, refresh).
---

# AuthHero API Reference

This document provides a reference for the AuthHero API.

## Authentication Methods

### Login

```typescript
await authHero.login(options);
```

Initiates the login process for a user.

**Parameters:**

- `options`: An object with the following properties:
  - `email`: The user's email address
  - `password`: The user's password
  - `connection`: The connection to use for authentication

**Returns:**

A promise that resolves to a token response object.

### Signup

```typescript
await authHero.signup(options);
```

Registers a new user.

**Parameters:**

- `options`: An object with the following properties:
  - `email`: The user's email address
  - `password`: The user's password
  - `connection`: The connection to use for registration
  - `user_metadata`: Optional metadata for the user

**Returns:**

A promise that resolves to a user object.

## Token Methods

### Validate Token

```typescript
await authHero.validateToken(token);
```

Validates a JWT token.

**Parameters:**

- `token`: The JWT token to validate

**Returns:**

A promise that resolves to a decoded token payload if valid, or throws an error if invalid.

### Refresh Token

```typescript
await authHero.refreshToken(refreshToken);
```

Refreshes an access token using a refresh token.

**Parameters:**

- `refreshToken`: The refresh token

**Returns:**

A promise that resolves to a new token response object.

## User Management Methods

[User management methods will be documented here]

## Tenant Management Methods

[Tenant management methods will be documented here]

## Application Management Methods

[Application management methods will be documented here]

## Connection Management Methods

[Connection management methods will be documented here]

## Domain Management Methods

[Domain management methods will be documented here]