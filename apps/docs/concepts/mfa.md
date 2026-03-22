---
title: Multi-Factor Authentication (MFA)
description: Add an extra layer of security to your AuthHero tenant with SMS-based multi-factor authentication.
---

# Multi-Factor Authentication (MFA)

Multi-factor authentication adds a second verification step after a user enters their password. AuthHero supports SMS-based MFA, compatible with Auth0's Guardian API.

## How It Works

1. **Tenant enables MFA** — An admin sets the MFA policy to "always" and enables the SMS factor via the Guardian API or React Admin settings.
2. **User logs in** — The user authenticates with their primary credential (password, social login, etc.).
3. **MFA check** — After authentication, the login flow checks if the tenant requires MFA.
4. **Enrollment** — If the user has no MFA enrollment, they are redirected to enter a phone number and verify it with a one-time code.
5. **Verification** — On subsequent logins, the user receives an SMS code and must enter it to complete login.

## MFA Policy

The MFA policy is set at the tenant level:

| Policy | Behavior |
|--------|----------|
| `never` (default) | MFA is not required |
| `always` | MFA is required for every login |

## Supported Factors

| Factor | Status |
|--------|--------|
| SMS | Supported |
| TOTP (Authenticator app) | Planned |
| Email | Planned |
| WebAuthn | Planned |
| Push Notification | Planned |

## SMS Providers

AuthHero supports multiple SMS providers for delivering verification codes:

- **Twilio** (default)
- **Vonage**
- **AWS SNS**
- **Custom webhook** (`phone_message_hook`)

## State Machine

MFA integrates with the login session state machine. After the user authenticates (state: `authenticated`), if MFA is required the session transitions to `awaiting_mfa`. After successful verification, it returns to `authenticated` and proceeds to token issuance.

```
pending → authenticated → awaiting_mfa → authenticated → completed
```

## Management API

MFA is managed through two sets of API endpoints:

- **Guardian API** (`/api/v2/guardian/`) — Configure MFA factors, policies, and SMS providers at the tenant level.
- **Authentication Methods API** (`/api/v2/users/{user_id}/authentication-methods`) — Manage per-user MFA enrollments (list, create, delete).

See the [MFA Setup Guide](/guides/mfa-setup) for detailed configuration steps.
