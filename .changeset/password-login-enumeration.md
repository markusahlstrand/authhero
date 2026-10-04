---
"authhero": patch
---

Password logins no longer reveal whether an account exists. An unknown email, a broken linked account and a wrong password now all fail the same way: `403` with code `INVALID_CREDENTIALS` and the message "Wrong email or password.". Before, an unknown user got `USER_NOT_FOUND` / "User not found" and a wrong password got `INVALID_PASSWORD` / "Invalid password", so a client calling `/co/authenticate` could tell them apart. Clients that match on the old codes or messages see the new one instead. The tenant logs still record `fu` for an unknown user and `fp` for a wrong password.

The unknown-user path also runs a bcrypt check against a dummy hash now, so it takes about as long as a wrong password and response time no longer gives the answer away either. The same applies to a user who has no local password.
