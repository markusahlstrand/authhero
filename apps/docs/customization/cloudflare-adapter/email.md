---
title: Email Sending
description: Send AuthHero emails through the Cloudflare Email Sending Worker binding.
---

# Email Sending

`createCloudflareEmailService` wraps a [Cloudflare Email Sending](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) `send_email` binding as an `EmailServiceAdapter`. Nothing is stored in the database: the binding and the sender come from your Worker configuration.

## Setup

Onboard the sending domain (`npx wrangler email sending enable example.com`) and declare the binding:

```jsonc
// wrangler.jsonc
{
  "send_email": [{ "name": "EMAIL" }],
}
```

Inject the adapter as `emailService`:

```typescript
import { createCloudflareEmailService } from "@authhero/cloudflare-adapter";

const dataAdapter = {
  ...database,
  emailService: createCloudflareEmailService({
    binding: env.EMAIL,
    // Optional: a sender on the onboarded domain. When set it replaces the
    // from-address AuthHero resolves from the tenant and template.
    from: { email: "no-reply@example.com", name: "Example" },
  }),
};
```

AuthHero only calls `emailService` for tenants that have an email provider whose `name` is not one of the built-in services (`mailgun`, `resend`, `postmark`). Create one per tenant, for example:

```json
{
  "name": "cloudflare",
  "enabled": true,
  "default_from_address": "no-reply@example.com",
  "credentials": {}
}
```

## Options

| Option    | Description                                                                     |
| --------- | ------------------------------------------------------------------------------- |
| `binding` | The `send_email` binding (`env.EMAIL`). Required.                               |
| `from`    | Sender address or `{ email, name }`. Defaults to the address AuthHero passes.   |
| `replyTo` | Reply-to address added to every message.                                        |
| `headers` | Extra headers added to every message. Cloudflare validates them before sending. |

Without `from`, a sender in the form `Name <address>` is split into `{ email, name }` before it is passed to the binding. The sender domain must be onboarded to Email Sending, or the binding rejects the message with `E_SENDER_NOT_VERIFIED`.

Binding errors are rethrown as `Cloudflare Email Sending failed: <code>: <message>`, so they show up in the tenant's failed-notification logs.
