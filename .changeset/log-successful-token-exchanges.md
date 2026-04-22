---
"authhero": patch
---

Fill gaps in audit/log emission across auth flows:

- `/oauth/token` now emits success logs (`seacft`, `sertft`, `seccft`, `seotpft`) after tokens are minted, and failure logs (`fertft`, `feccft`, `feotpft`) on refresh-token, client-credentials, and passwordless-OTP exchange errors.
- Universal-login passwordless flow emits `seotpft` after OTP validation.
- `/u/validate-email` emits `sv` on success and `fv` on failure paths.
- Account email-change verification emits `sce` after the new email is set.
- Management API user deletion emits `sdu` alongside the existing `sapi` log.
- Logout emits `srrt` when refresh tokens are revoked and `flo` on invalid redirect_uri.
