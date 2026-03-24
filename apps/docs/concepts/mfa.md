---
title: Multi-Factor Authentication (MFA)
description: Add an extra layer of security to your AuthHero tenant with multi-factor authentication using SMS or authenticator apps.
---

# Multi-Factor Authentication (MFA)

Multi-factor authentication adds a second verification step after a user enters their password. AuthHero supports SMS and TOTP (authenticator app) MFA, compatible with Auth0's Guardian API.

## How It Works

1. **Tenant enables MFA** — An admin sets the MFA policy to "always" and enables one or more factors (SMS or OTP) via the Guardian API or React Admin settings.
2. **User logs in** — The user authenticates with their primary credential (password, social login, etc.).
3. **MFA check** — After authentication, the login flow checks if the tenant requires MFA.
4. **Enrollment** — If the user has no MFA enrollment, they are redirected to set up their second factor:
   - **SMS**: Enter a phone number and verify with a one-time code sent via SMS.
   - **TOTP**: Scan a QR code with an authenticator app (Google Authenticator, Authy, etc.) and verify with a 6-digit code.
5. **Verification** — On subsequent logins, the user enters a code from their enrolled factor to complete login.

## MFA Policy

The MFA policy is set at the tenant level:

| Policy | Behavior |
|--------|----------|
| `never` (default) | MFA is not required |
| `always` | MFA is required for every login |

## Supported Factors

| Factor | Status | Description |
|--------|--------|-------------|
| SMS | Supported | One-time code sent via SMS |
| TOTP (Authenticator app) | Supported | Time-based code from apps like Google Authenticator |
| Email | Planned | |
| WebAuthn | Planned | |
| Push Notification | Planned | |

When multiple factors are enabled, TOTP takes priority for new enrollments. Users with an existing enrollment (SMS or TOTP) will use their enrolled factor.

## TOTP (Authenticator App)

TOTP (Time-based One-Time Password) works with standard authenticator apps:

- **Google Authenticator**
- **Authy**
- **Microsoft Authenticator**
- **1Password**
- Any app supporting the `otpauth://` URI standard

During enrollment, the user is shown a QR code and a manual entry key. They scan the QR code with their authenticator app and enter the 6-digit code to verify. On subsequent logins, they enter the current code from their app.

TOTP uses 6-digit codes with a 30-second time window and SHA-1 HMAC, following [RFC 6238](https://datatracker.ietf.org/doc/html/rfc6238).

## SMS Providers

For SMS-based MFA, AuthHero supports multiple SMS providers:

- **Twilio** (default)
- **Vonage**
- **AWS SNS**
- **Custom webhook** (`phone_message_hook`)

## State Machine

MFA integrates with the login session state machine. After the user authenticates (state: `authenticated`), if MFA is required the session transitions to `awaiting_mfa`. After successful verification, it returns to `authenticated` and proceeds to token issuance.

```
pending → authenticated → awaiting_mfa → authenticated → completed
```

## Enrollment Tickets

Enrollment tickets let an admin invite a specific user to set up MFA without enforcing it for all users. This is useful for gradual MFA rollouts:

1. **Admin creates a ticket** via `POST /api/v2/guardian/enrollments/ticket` with the user's `user_id`.
2. **API returns a `ticket_url`** — a single-use link valid for 5 days.
3. **Admin shares the link** with the user (email, chat, etc.).
4. **User opens the link** and is redirected to the MFA enrollment screen (TOTP or SMS, depending on enabled factors).
5. **User completes enrollment** — the enrollment is confirmed and the link is consumed.

Enrollment tickets work whenever MFA factors are enabled, regardless of the MFA policy. This lets you enable factors first, pre-enroll users via tickets, and then set the policy to `always` once your users are ready.

::: tip Gradual Rollout
Enable MFA factors with the policy set to `never`. Send enrollment tickets to users so they can set up MFA at their own pace. Once enough users have enrolled, switch the policy to `always`.
:::

## Management API

MFA is managed through three sets of API endpoints:

- **Guardian API** (`/api/v2/guardian/`) — Configure MFA factors, policies, and SMS providers at the tenant level.
- **Guardian Enrollment Tickets** (`POST /api/v2/guardian/enrollments/ticket`) — Create enrollment invitation links for specific users.
- **Authentication Methods API** (`/api/v2/users/{user_id}/authentication-methods`) — Manage per-user MFA enrollments (list, create, delete).

See the [MFA Setup Guide](/guides/mfa-setup) for detailed configuration steps.
