---
title: Multi-Factor Authentication
description: Guide to enabling MFA in AuthHero — TOTP, SMS, and WebAuthn/Passkeys.
---

# Multi-Factor Authentication

AuthHero supports multiple MFA factors: TOTP (authenticator apps), SMS, and WebAuthn (security keys and passkeys). All factors are managed through a unified **Authentication Methods** model — the same API is used regardless of factor type.

## Supported Factors

| Factor | Guardian Name | Type in API | Description |
|--------|--------------|-------------|-------------|
| TOTP | `otp` | `totp` | Authenticator apps (Google Authenticator, Authy, 1Password, etc.) |
| SMS | `sms` | `phone` | One-time code via text message |
| WebAuthn (Roaming) | `webauthn-roaming` | `webauthn-roaming` | Cross-platform security keys (YubiKey, etc.) |
| WebAuthn (Platform) | `webauthn-platform` | `webauthn-platform` | Built-in biometrics (Touch ID, Windows Hello, etc.) |
| Passkey | — | `passkey` | Synced discoverable credentials — can be used for both passwordless login and MFA |

## Quick Start: TOTP

TOTP requires no external provider.

### 1. Enable the OTP Factor

```bash
curl -X PUT /api/v2/guardian/factors/otp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### 2. Set the MFA Policy

```bash
curl -X PUT /api/v2/guardian/policies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '["all-applications"]'
```

### User Enrollment Flow (TOTP)

When a user without an authentication method logs in:

1. User enters credentials (password, social login, etc.)
2. User is redirected to the **TOTP Enrollment** screen (`/u2/mfa/totp-enrollment`)
3. A QR code and manual secret key are displayed
4. User scans the QR code with their authenticator app
5. User enters the 6-digit code from their app to verify
6. On success, the authentication method is confirmed and login completes

On subsequent logins, the user is shown the **TOTP Challenge** screen (`/u2/mfa/totp-challenge`) and enters the current code from their authenticator app.

## Quick Start: SMS

SMS-based MFA sends a one-time code via text message.

### Prerequisites

- A configured SMS provider (Twilio, Vonage, or AWS SNS)
- SMS provider credentials (e.g., Twilio Account SID, Auth Token, and a sending phone number)

### 1. Configure SMS Provider

```bash
# Select Twilio as the SMS provider
curl -X PUT /api/v2/guardian/factors/sms/selected-provider \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider": "twilio"}'

# Configure Twilio credentials
curl -X PUT /api/v2/guardian/factors/sms/providers/twilio \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sid": "AC...",
    "auth_token": "your_auth_token",
    "from": "+15551234567"
  }'
```

### 2. Enable the SMS Factor

```bash
curl -X PUT /api/v2/guardian/factors/sms \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### 3. Set the MFA Policy

```bash
curl -X PUT /api/v2/guardian/policies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '["all-applications"]'
```

### User Enrollment Flow (SMS)

When a user without an authentication method logs in:

1. User enters credentials (password, social login, etc.)
2. User is redirected to the **MFA Phone Enrollment** screen (`/u2/mfa/phone-enrollment`)
3. User enters their phone number
4. A 6-digit verification code is sent via SMS
5. User enters the code on the **MFA Phone Challenge** screen (`/u2/mfa/phone-challenge`)
6. On success, the authentication method is confirmed and login completes

On subsequent logins, the user skips enrollment and goes directly to SMS verification.

## WebAuthn and Passkeys

WebAuthn enables phishing-resistant MFA using security keys or platform biometrics. AuthHero supports three WebAuthn-based authentication method types:

- **`webauthn-roaming`** — Cross-platform authenticators like YubiKey, Titan Security Key
- **`webauthn-platform`** — Built-in platform authenticators like Touch ID, Face ID, Windows Hello
- **`passkey`** — Synced discoverable credentials that can serve as both primary login and MFA

### Key Concepts

**Same credential, different flows**: A passkey registered for a user can be used as a first factor (passwordless) or as a second factor (after password). The login flow context determines its role — no per-credential role flags are needed.

**Authentication Methods model**: WebAuthn credentials are stored alongside TOTP and SMS methods in the unified Authentication Methods API. Each WebAuthn method stores:

| Field | Description |
|-------|-------------|
| `credential_id` | Base64url-encoded credential identifier |
| `public_key` | Base64url-encoded COSE public key |
| `sign_count` | Signature counter for clone detection |
| `credential_backed_up` | Whether the credential is synced (e.g., iCloud Keychain) |
| `transports` | Array of supported transports (`"internal"`, `"usb"`, `"ble"`, `"nfc"`, `"hybrid"`) |
| `friendly_name` | User-chosen label (e.g., "My iPhone", "YubiKey 5C") |

### Enable WebAuthn Factors

```bash
# Enable platform authenticators (biometrics)
curl -X PUT /api/v2/guardian/factors/webauthn-platform \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Enable roaming authenticators (security keys)
curl -X PUT /api/v2/guardian/factors/webauthn-roaming \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### Register a WebAuthn Credential via API

```bash
curl -X POST /api/v2/users/{user_id}/authentication-methods \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "passkey",
    "credential_id": "dGVzdC1jcmVkZW50aWFsLWlk",
    "public_key": "pQECAyYgASFYIE2...",
    "sign_count": 0,
    "credential_backed_up": true,
    "transports": ["internal", "hybrid"],
    "friendly_name": "My iPhone",
    "confirmed": true
  }'
```

## Enrollment Tickets

Enrollment tickets let you invite individual users to set up MFA without enforcing it for all logins. This is useful for gradual rollouts or when you want specific users to enroll before enabling the policy globally.

### Prerequisites

- At least one MFA factor (OTP or SMS) must be enabled on the tenant.
- The MFA policy does **not** need to be set to `always` — tickets work regardless of the policy setting.

### Create a Ticket via API

```bash
curl -X POST /api/v2/guardian/enrollments/ticket \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "auth0|671234567890",
    "send_mail": false
  }'
```

Response:

```json
{
  "ticket_id": "abc123...",
  "ticket_url": "https://your-domain.com/u2/guardian/enroll?ticket=abc123..."
}
```

Share the `ticket_url` with the user. When they open it, they are redirected to the appropriate enrollment screen (TOTP or SMS) based on the enabled factors.

### Ticket Behavior

- **Single-use** — A ticket can only be redeemed once.
- **Expires after 5 days** — Expired tickets return a 403 error.
- **Factor selection** — If both OTP and SMS factors are enabled, the user is shown a factor selection screen. If only one factor is enabled, they go directly to that enrollment.
- **No login required** — The ticket creates its own session; the user does not need to authenticate first.

### Create a Ticket via React Admin

1. Navigate to a user's detail page
2. Go to the **MFA** tab
3. Click **Create Enrollment Ticket**
4. Copy the generated URL from the dialog and share it with the user

### Gradual Rollout Workflow

1. Enable MFA factors (OTP, SMS, or both) — leave the policy set to `never`
2. Send enrollment tickets to users so they can set up MFA at their own pace
3. Monitor authentication methods via the API or the user MFA tab in React Admin
4. Once enough users are enrolled, set the policy to `always` to enforce MFA for all logins

## Disabling MFA

To disable MFA:

```bash
curl -X PUT /api/v2/guardian/policies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '[]'
```

## Using React Admin

You can also configure MFA via the React Admin UI:

1. Navigate to **Settings** > **MFA Factors** tab
2. Set **MFA Policy** to "Always (require for all logins)"
3. Enable the **OTP** toggle (for authenticator apps) or the **SMS** toggle (for text messages)
4. If using SMS, go to the **SMS Provider** tab and enter your Twilio credentials

## Managing Authentication Methods

### List a user's authentication methods

```bash
curl /api/v2/users/{user_id}/authentication-methods \
  -H "Authorization: Bearer $TOKEN"
```

Response example (TOTP):

```json
[
  {
    "id": "01J...",
    "type": "totp",
    "confirmed": true,
    "created_at": "2026-03-23T10:00:00.000Z"
  }
]
```

Response example (SMS):

```json
[
  {
    "id": "01J...",
    "type": "phone",
    "confirmed": true,
    "phone_number": "+15551234567",
    "created_at": "2026-03-22T10:00:00.000Z"
  }
]
```

Response example (Passkey):

```json
[
  {
    "id": "01J...",
    "type": "passkey",
    "confirmed": true,
    "credential_id": "dGVzdC1jcmVkZW50aWFsLWlk",
    "friendly_name": "My iPhone",
    "created_at": "2026-03-28T10:00:00.000Z"
  }
]
```

### Remove an authentication method

```bash
curl -X DELETE /api/v2/users/{user_id}/authentication-methods/{method_id} \
  -H "Authorization: Bearer $TOKEN"
```

### Admin-create an authentication method

```bash
# TOTP
curl -X POST /api/v2/users/{user_id}/authentication-methods \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "totp",
    "totp_secret": "JBSWY3DPEHPK3PXP",
    "confirmed": true
  }'

# SMS
curl -X POST /api/v2/users/{user_id}/authentication-methods \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "phone",
    "phone_number": "+15551234567",
    "confirmed": true
  }'

# Passkey
curl -X POST /api/v2/users/{user_id}/authentication-methods \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "passkey",
    "credential_id": "dGVzdC1jcmVkZW50aWFsLWlk",
    "public_key": "pQECAyYgASFYIE2...",
    "sign_count": 0,
    "transports": ["internal", "hybrid"],
    "friendly_name": "My iPhone",
    "confirmed": true
  }'
```

## Auth0 Compatibility

AuthHero's MFA implementation is compatible with Auth0's Guardian API:

| Auth0 Endpoint | AuthHero Support |
|----------------|-----------------|
| `GET /api/v2/guardian/factors` | Supported |
| `PUT /api/v2/guardian/factors/{name}` | Supported |
| `GET/PUT /api/v2/guardian/policies` | Supported |
| `GET/PUT /api/v2/guardian/factors/sms/selected-provider` | Supported |
| `GET/PUT /api/v2/guardian/factors/sms/providers/twilio` | Supported |
| `POST /api/v2/guardian/enrollments/ticket` | Supported |
| `GET/POST/DELETE /api/v2/users/{id}/authentication-methods` | Supported |

## Troubleshooting

### TOTP code not accepted

- Ensure the user's device clock is accurate. TOTP codes are time-based and require the device to be within ~30 seconds of the server time.
- Have the user try the next code that appears in their authenticator app.
- If the user has lost access to their authenticator app, an admin can delete the authentication method and let them re-enroll.

### SMS not being received

- Verify Twilio credentials are correct (check the **SMS Provider** tab in React Admin)
- Ensure the `from` phone number is a valid Twilio number
- Check that the SMS factor is enabled (`GET /api/v2/guardian/factors/sms`)
- Verify the MFA policy is set to "always" (`GET /api/v2/guardian/policies`)

### User stuck on MFA screen

- The login session may have expired. The user should restart the login flow.
- Check the login session state — it should be `awaiting_mfa`.

### Removing MFA for a user

Use the management API to delete the user's authentication methods:

```bash
curl -X DELETE /api/v2/users/{user_id}/authentication-methods/{method_id} \
  -H "Authorization: Bearer $TOKEN"
```

Or use the **MFA** tab on the user detail page in React Admin.
