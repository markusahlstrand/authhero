---
title: MFA Setup Guide
description: Step-by-step guide to enabling SMS-based multi-factor authentication in AuthHero.
---

# MFA Setup Guide

This guide walks through enabling SMS-based multi-factor authentication for your AuthHero tenant.

## Prerequisites

- A configured SMS provider (Twilio, Vonage, or AWS SNS)
- SMS provider credentials (e.g., Twilio Account SID, Auth Token, and a sending phone number)

## 1. Configure SMS Provider

Set up Twilio (or another provider) via the Guardian API:

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

## 2. Enable the SMS Factor

```bash
curl -X PUT /api/v2/guardian/factors/sms \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

## 3. Set the MFA Policy

Enable MFA for all logins:

```bash
curl -X PUT /api/v2/guardian/policies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '["all-applications"]'
```

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
3. Enable the **SMS** toggle
4. Go to the **SMS Provider** tab and enter your Twilio credentials

## User Enrollment Flow

When MFA is enabled and a user without an enrollment logs in:

1. User enters credentials (password, social login, etc.)
2. User is redirected to the **MFA Phone Enrollment** screen (`/u2/mfa/phone`)
3. User enters their phone number
4. A 6-digit verification code is sent via SMS
5. User enters the code on the **MFA SMS Verification** screen (`/u2/mfa/sms`)
6. On success, the enrollment is confirmed and login completes

On subsequent logins, the user skips enrollment and goes directly to SMS verification.

## Managing User Enrollments

### List a user's MFA enrollments

```bash
curl /api/v2/users/{user_id}/authentication-methods \
  -H "Authorization: Bearer $TOKEN"
```

Response:

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

### Remove a user's MFA enrollment

```bash
curl -X DELETE /api/v2/users/{user_id}/authentication-methods/{method_id} \
  -H "Authorization: Bearer $TOKEN"
```

### Admin-create an enrollment

```bash
curl -X POST /api/v2/users/{user_id}/authentication-methods \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "phone",
    "phone_number": "+15551234567",
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
| `GET/POST/DELETE /api/v2/users/{id}/authentication-methods` | Supported |

## Troubleshooting

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
