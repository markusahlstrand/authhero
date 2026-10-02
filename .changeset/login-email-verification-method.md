---
"authhero": minor
---

Show a proper email verification step on u2 when `email_validation` is `"enforced"` and the user's email is unverified, instead of a field error under the password field. The database connection's `attributes.email.verification_method` picks the method. With `"code"` (default), the user enters an emailed code and the same login continues. With `"link"`, a "check your email" screen is shown and the emailed link returns the user to the login screen. Both screens can resend the email. Signup no longer sends two verification emails when verification is enforced.
