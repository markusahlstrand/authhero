---
"authhero": minor
---

Email provider improvements:

- Fix Mailgun send failing with `400 Only one parameters 'html' or 'template' is allowed`. The adapter now sends `html` when provided and falls back to `template` only when no rendered HTML is available.
- Add built-in `ResendEmailService` (`emailProvider.name === "resend"`). Credentials: `{ api_key }`. POSTs JSON to `https://api.resend.com/emails`.
- Add built-in `PostmarkEmailService` (`emailProvider.name === "postmark"`). Credentials: `{ api_key }` (used as `X-Postmark-Server-Token`). Uses `/email` with `HtmlBody`/`TextBody` when `html` is provided, otherwise `/email/withTemplate` with `TemplateAlias` + `TemplateModel`.
