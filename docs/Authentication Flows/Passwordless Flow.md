# Passwordless Authentication Flow

This document describes how the passwordless authentication flow works in AuthHero, which is similar to Auth0's implementation but includes additional features like magic link support in the universal login flow.

## Overview

Passwordless authentication allows users to log in without entering a password. Instead, they receive a verification code or magic link via email or SMS. This approach reduces password-related security risks and provides a better user experience, especially on mobile devices.

AuthHero supports two types of passwordless authentication:

- **Code-based**: Users receive a one-time code (OTP) via email or SMS
- **Link-based**: Users receive a magic link via email that automatically logs them in

## Authentication Methods

### 1. Code-Based Authentication

In this flow, users receive a 6-digit OTP that they enter to complete authentication.

#### Email Code Flow

1. User enters their email address
2. AuthHero generates a 6-digit OTP
3. OTP is sent via email using the `auth-code` template
4. User enters the received code
5. AuthHero validates the code and completes authentication

#### SMS Code Flow

1. User enters their phone number (with country code)
2. AuthHero generates a 6-digit OTP
3. OTP is sent via SMS
4. User enters the received code
5. AuthHero validates the code and completes authentication

### 2. Magic Link Authentication

Magic links provide a one-click authentication experience where users simply click a link to log in.

#### Email Magic Link Flow

1. User enters their email address
2. AuthHero generates a unique verification code
3. A magic link containing the verification code is sent via email using the `auth-link` template
4. User clicks the magic link
5. AuthHero validates the code and completes authentication automatically

## Universal Login Integration

### Connection Configuration

Passwordless authentication is configured at the connection level. Each connection can specify its authentication method:

```typescript
{
  name: "email",
  options: {
    authentication_method: "magic_link" | "code"
  }
}
```

### Send Type Detection

AuthHero automatically determines whether to send a code or magic link based on:

1. **Client Type**: Mobile app clients (e.g., `Auth0.swift`) default to code-based authentication
2. **Connection Settings**: The connection's `authentication_method` configuration
3. **Auth0Client Header**: The `Auth0-Client` header helps identify the client type

## API Endpoints

### Passwordless Start

Initiates a passwordless authentication flow via API (non-universal login).

**Endpoint**: `POST /passwordless/start`

**Request Body**:

```json
{
  "connection": "email", // or "sms"
  "client_id": "your_client_id",
  "email": "user@example.com", // for email connection
  "phone_number": "+1234567890", // for SMS connection
  "send": "link", // or "code"
  "authParams": {
    "redirect_uri": "https://your-app.com/callback",
    "response_type": "code",
    "scope": "openid email profile",
    "state": "random_state_value"
  }
}
```

**Response**: `200 OK` with "OK" text

### Magic Link Verification

When users click a magic link, they're redirected to the verification endpoint.

**Endpoint**: `GET /passwordless/verify_redirect`

**Query Parameters**:

- `verification_code`: The unique code from the magic link
- `connection`: The connection type (email/sms)
- `client_id`: The client identifier
- `email`: The user's email address
- `redirect_uri`: Where to redirect after authentication
- `response_type`: OAuth response type
- `scope`: Requested scopes
- `state`: OAuth state parameter
- `nonce`: OAuth nonce parameter (optional)

### Code Verification

For code-based authentication, users submit their OTP through the universal login interface.

**Endpoint**: `POST /u/enter-code`

**Form Data**:

- `code`: The 6-digit OTP received via email or SMS
- `state`: The login session state

## Universal Login Flow

### 1. Identifier Page (`/u/login/identifier`)

- User enters email or phone number
- System determines connection type automatically
- Redirects to password or code entry based on configuration

### 2. Code Entry Page (`/u/enter-code`)

- Displays when passwordless authentication is selected
- Shows the delivery method (email/SMS)
- Provides option to resend code
- Shows fallback to password if available

### 3. Authentication Completion

- Code is validated using the `passwordlessGrant` function
- User account is created if it doesn't exist
- Session is established and user is redirected to the application

## Code Generation and Validation

### Validation Rules

- Codes expire after 30 minutes (`OTP_EXPIRATION_TIME`)
- Each code can only be used once
- Codes are tied to the specific login session
- IP address validation (optional security check)

## Email Templates

### Code Template (`auth-code`)

Used for sending OTP codes via email:

- Subject: "Your verification code"
- Contains the 6-digit code
- Includes branding and support information
- Valid for 30 minutes

### Magic Link Template (`auth-link`)

Used for sending magic links via email:

- Subject: "Your login link"
- Contains the magic link button
- Includes fallback code entry option
- Branded with tenant information

## Security Considerations

### Rate Limiting

- Codes have a limited lifetime (30 minutes)
- Each code can only be used once
- Failed attempts should be logged and monitored

### IP Validation

```typescript
if (loginSession.ip && clientInfo.ip && loginSession.ip !== clientInfo.ip) {
  return ctx.redirect(
    `${getUniversalLoginUrl(ctx.env)}invalid-session?state=${loginSession.id}`,
  );
}
```

### Session Management

- Login sessions are created for each authentication attempt
- Sessions contain the original authentication parameters
- Sessions expire to prevent replay attacks

## Error Handling

Common error scenarios and responses:

### Invalid Code

- **Status**: 400 Bad Request
- **Message**: "Code not found or expired"
- **Action**: User can request a new code

### Expired Code

- **Status**: 400 Bad Request
- **Message**: "Code expired"
- **Action**: User must request a new code

### Used Code

- **Status**: 400 Bad Request
- **Message**: "Code already used"
- **Action**: User must request a new code

### Invalid Session

- **Redirect**: `/u/invalid-session`
- **Cause**: IP address mismatch or session tampering
- **Action**: User must restart authentication flow

## Differences from Auth0

While AuthHero's passwordless flow is largely compatible with Auth0, there are some key differences:

1. **Magic Links in Universal Login**: AuthHero allows magic link authentication in the universal login flow, while Auth0 typically requires API-based flows for magic links.

2. **Connection-Level Configuration**: Authentication method (code vs. magic link) is configured at the connection level rather than being purely client-driven.

3. **Enhanced Security**: Additional IP validation and session management features.

4. **Flexible Template System**: Customizable email templates for both codes and magic links.

## Best Practices

### For Developers

- Always validate the `connection` parameter to ensure it supports passwordless
- Implement proper error handling for all failure scenarios
- Use appropriate email templates for your brand
- Consider the user experience when choosing between codes and magic links

### For Users

- Magic links provide the best user experience for email-based authentication
- SMS codes work well for mobile applications
- Consider fallback options for users who don't receive emails/SMS

### Security

- Monitor failed authentication attempts
- Implement rate limiting on code generation
- Use HTTPS for all magic link URLs
- Validate redirect URIs to prevent open redirects

## Configuration Example

```typescript
// Enable passwordless for email connection
{
  "name": "email",
  "strategy": "email",
  "options": {
    "authentication_method": "magic_link", // or "code"
    "disable_signup": false,
    "brute_force_protection": true
  }
}

// Enable passwordless for SMS connection
{
  "name": "sms",
  "strategy": "sms",
  "options": {
    "authentication_method": "code", // SMS only supports codes
    "disable_signup": false,
    "from": "+1234567890",
    "syntax": "alphanumeric", // or "numeric"
    "template": "Your verification code is @@password@@"
  }
}
```

This passwordless implementation provides a secure, user-friendly authentication method that reduces password-related vulnerabilities while maintaining compatibility with Auth0 flows.
