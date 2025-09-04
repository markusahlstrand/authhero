# Session Management

AuthHero uses a dual-session architecture with **Login Sessions** and **Sessions** to handle authentication flows and user sessions. Understanding how these work together is crucial for developers working with the AuthHero authentication system.

## Overview

- **Login Sessions**: Temporary sessions that track authentication flows (e.g., OAuth authorization, universal login)
- **Sessions**: Long-lived user sessions that persist across multiple applications and login flows

## Login Sessions

Login sessions are temporary, short-lived sessions that track a specific authentication flow from start to finish.

### Purpose

- Track OAuth authorization flows
- Store authentication parameters (client_id, redirect_uri, scope, etc.)
- Maintain state during multi-step authentication processes
- Handle CSRF protection via state parameters

### Lifecycle

1. **Created** when an authentication flow starts (e.g., `/authorize` endpoint)
2. **Updated** as the flow progresses (e.g., linking to user sessions)
3. **Completed** when authentication succeeds and tokens are issued
4. **Expired** after a short time (typically 5-10 minutes)

### Key Properties

- `id`: Unique identifier (used as OAuth `state` parameter)
- `authParams`: OAuth parameters (client_id, redirect_uri, scope, etc.)
- `session_id`: Reference to linked user session (optional)
- `expires_at`: Short expiration time
- `csrf_token`: CSRF protection

### Example

```typescript
// Created during /authorize
const loginSession = {
  id: "login_abc123",
  authParams: {
    client_id: "app123",
    redirect_uri: "https://app.com/callback",
    scope: "openid email profile",
  },
  session_id: null, // Initially not linked
  expires_at: "2025-09-04T12:05:00Z", // 5 minutes from now
  csrf_token: "csrf_xyz789",
};
```

## Sessions

Sessions are long-lived user sessions that persist across multiple applications and authentication flows.

### Purpose

- Represent an authenticated user session
- Enable Single Sign-On (SSO) across applications
- Store session metadata (device info, last activity, etc.)
- Support session management (logout, revocation)

### Lifecycle

1. **Created** when a user successfully authenticates
2. **Reused** for subsequent authentication flows (SSO)
3. **Updated** when linked to new login sessions or applications
4. **Expired** after inactivity or explicit logout

### Key Properties

- `id`: Unique session identifier
- `user_id`: Reference to the authenticated user
- `login_session_id`: Reference to the login session that created this session
- `clients`: List of applications that have used this session
- `expires_at`: Long expiration time
- `device`: Device and browser information

### Example

```typescript
// Created after successful authentication
const session = {
  id: "session_def456",
  user_id: "email|user123",
  login_session_id: "login_abc123",
  clients: ["app123"],
  expires_at: "2025-09-11T12:00:00Z", // 7 days from now
  device: {
    last_ip: "192.168.1.1",
    last_user_agent: "Mozilla/5.0...",
  },
};
```

## Session Linking

The relationship between login sessions and sessions is dynamic and changes throughout authentication flows.

### Initial Creation

When a user first authenticates:

1. Login session is created for the OAuth flow
2. User completes authentication (password, social, etc.)
3. New session is created and linked to the login session
4. Login session's `session_id` is set to the new session's `id`

### Session Reuse (SSO)

When a user has an existing session:

1. New login session is created for the OAuth flow
2. System detects existing valid session (via cookie)
3. Existing session is linked to the new login session
4. No new session is created - the existing one is reused

### Example Flow

#### First Login

```
1. GET /authorize → Creates login_session_1 (session_id: null)
2. User authenticates → Creates session_1 (login_session_id: login_session_1)
3. login_session_1 updated → (session_id: session_1)
```

#### Subsequent Login (SSO)

```
1. GET /authorize → Creates login_session_2 (session_id: null)
2. System detects session_1 via cookie
3. login_session_2 updated → (session_id: session_1)
4. session_1 updated → (clients: [..., new_client])
```

## Implementation Patterns

### Creating Sessions

Always create sessions linked to a login session:

```typescript
// ✅ Correct
const session = await env.data.sessions.create("tenantId", {
  id: "sessionId",
  user_id: "email|userId",
  login_session_id: loginSession.id, // Always link to login session
  clients: ["clientId"],
  // ... other fields
});
```

### Linking Existing Sessions

When reusing an existing session for a new login flow:

```typescript
// Link existing session to new login session
await env.data.loginSessions.update("tenantId", loginSession.id, {
  session_id: existingSession.id,
});

// Update session's client list if needed
await env.data.sessions.update("tenantId", existingSession.id, {
  clients: [...existingSession.clients, newClientId],
});
```

### Authentication Response

Always pass the session ID to ensure session reuse:

```typescript
return createFrontChannelAuthResponse(ctx, {
  user,
  authParams: loginSession.authParams,
  client,
  loginSession: { ...loginSession, session_id: existingSession.id },
  sessionId: existingSession.id, // Ensures session reuse
});
```

## Security Considerations

### CSRF Protection

- Login session IDs are used as OAuth `state` parameters
- Prevents CSRF attacks during authentication flows

### Session Hijacking

- Sessions are tied to device metadata
- IP address and user agent tracking
- Secure cookie settings

### Session Expiration

- Login sessions: Short-lived (5-10 minutes)
- User sessions: Longer-lived (hours to days)
- Configurable expiration policies

## Common Patterns

### Universal Login Flow

1. User visits `/authorize`
2. Redirected to universal login (`/u/login/identifier`)
3. User authenticates
4. Session created and linked to login session
5. User redirected back to application

### Check Account Flow

1. User has existing session (cookie)
2. New authorization flow starts
3. Redirected to `/u/check-account`
4. Existing session linked to new login session
5. Authentication completes without re-login

### Silent Authentication

1. Application checks authentication status
2. Uses existing session if valid
3. No user interaction required
4. Tokens issued based on existing session

## Debugging Tips

### Finding Related Sessions

```sql
-- Find login session by state parameter
SELECT * FROM login_sessions WHERE id = 'state_parameter';

-- Find session linked to login session
SELECT s.* FROM sessions s
JOIN login_sessions ls ON s.id = ls.session_id
WHERE ls.id = 'state_parameter';

-- Find all sessions for a user
SELECT * FROM sessions WHERE user_id = 'email|user123';
```

### Common Issues

- **Session not linked**: Login session `session_id` is null
- **Multiple sessions**: User has multiple active sessions (normal for different devices)
- **Session reuse failure**: Existing session not properly linked to new login session

## Best Practices

1. **Always link sessions**: Every session should be created with a `login_session_id`
2. **Reuse existing sessions**: Don't create new sessions if a valid one exists
3. **Update client lists**: Add new clients to existing sessions when reusing
4. **Handle expiration**: Implement proper session cleanup and renewal
5. **Security first**: Always validate session ownership and device metadata
