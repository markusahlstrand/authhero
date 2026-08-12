---
"@authhero/adapter-interfaces": minor
"@authhero/admin": minor
"authhero": minor
---

Restrict form hooks to the `post-user-login` trigger, the only trigger that dispatches them.

`handleFormHook` is called from `postUserLoginHook` and nowhere else, but `formHookAllowedTriggers` accepted six triggers. A form hook on `pre-user-registration`, `post-user-registration`, `validate-registration-username`, `pre-user-deletion` or `post-user-deletion` was accepted by the management API, listed as enabled in the admin UI, and then never ran — indistinguishable from a form that is simply broken. The other triggers can't support a form hook: they run as decorators on `users.create` / `users.update` / `users.remove` (so they also fire for the management API, SCIM and tenant imports) and return a `User` rather than a `Response`, leaving no channel for the redirect a form hook depends on.

- `formHookAllowedTriggers` is narrowed to `post-user-login`, so `POST /api/v2/hooks` now rejects the rest with a 400 instead of storing a hook that can't run.
- `PATCH /api/v2/hooks/{id}` re-checks the trigger against the stored row, via the new `allowedTriggersForHook` helper. The body schema is a union of _partial_ variant schemas, so a patch carrying only `trigger_id` matches whichever member has no required field left and the stored hook's type is otherwise invisible to it. Only a _change_ is rejected: a row stored on a now-unsupported trigger can still be edited (and disabled), it just can't be moved further.
- The admin UI narrows the trigger list per hook type in both the create form and the details tab — form and page hooks to `post-user-login`, code hooks to the four triggers they support. A hook already stored on an unsupported trigger keeps it as a flagged choice so the rest of the record stays editable.

To collect data from new users, put the form hook on `post-user-login`: it runs on the first login immediately after signup, with the user created and the login session live.
