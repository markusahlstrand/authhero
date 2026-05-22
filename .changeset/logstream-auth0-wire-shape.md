---
"authhero": minor
"@authhero/adapter-interfaces": minor
---

Match Auth0's log-stream wire shape and emit additional Auth0-compatible audit events.

- HTTP log-stream payloads now wrap the event body under a `data` key (with `log_id` and `description` at the top level), matching Auth0's wire format. Logstash/Datadog pipelines using `%{[data]}` templates will now resolve correctly instead of producing literal `_split_type_failure` tags.
- New audit events emitted: `si`/`fi` (invite accept), `sv`/`fv` (email verification ticket), `svr`/`fvr` (verification email sent), `fcpr` (failed change-password request), `scoa`/`fcoa` (cross-origin authentication).
- Passwordless OTP exchange now emits `sepotpft`/`fepotpft` instead of the password-OTP (MFA) codes `seotpft`/`feotpft`. Adds the new `SUCCESS_EXCHANGE_PASSWORDLESS_OTP_FOR_ACCESS_TOKEN` log type to the catalog.
