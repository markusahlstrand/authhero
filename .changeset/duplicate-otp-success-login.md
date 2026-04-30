---
"authhero": patch
---

Stop emitting a duplicate `SUCCESS_LOGIN` ("s") log on passwordless OTP completions with `response_type=code`. The canonical login event is owned by the post-login hook; the OTP-exchange event now only fires for the implicit flow, where /oauth/token is not called.
