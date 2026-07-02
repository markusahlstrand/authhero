---
"authhero": patch
---

Show "Wrong username or password" on the combined login screen when the password is wrong, instead of leaking the raw i18n key "wrong-credentials". The screen translates against the login.login prompt whose Auth0 locale key is camelCase (wrongCredentials); the kebab-case key only exists for the login-id and login-password prompts.
