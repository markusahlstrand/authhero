---
"authhero": minor
"@authhero/admin": minor
---

Add a "try" action for webhooks so they can be triggered manually for a specific user.

- New management API endpoint `POST /api/v2/hooks/{hook_id}/try` (authhero extension; not in Auth0). Takes `{ user_id }`, invokes the webhook through the same code path as a real trigger (service-token Bearer auth, stripped user payload, SUCCESS_HOOK/FAILED_HOOK logging) and returns the upstream response `{ ok, status, body?, error? }`. Disabled hooks can be tried, so a webhook can be verified before enabling it.
- `invokeWebHook` is exported from `hooks/webhooks.ts` as the single-hook invoker returning the response details; `invokeHooks` now delegates to it per hook with unchanged behavior.
- Admin UI: the hook edit page shows a "Try" button for web hooks that opens a dialog to search for a user and trigger the webhook, displaying the upstream response status and body.
