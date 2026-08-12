---
"authhero": patch
---

Fix form-hook state handling and locale resolution.

- A multi-step form's accumulated answers are now actually cleared when the
  hook completes. `completeLoginSessionHook` passed `state_data: undefined`,
  which every adapter's `update` skips, so the column was left untouched and
  the answers outlived the form on the login session row.
- Required LEGAL and BOOLEAN fields on `/u2` form nodes are no longer
  satisfied by an unticked box: the widget posts JSON with every field
  serialised as a string, so a refusal arrived as `"false"` and passed the
  emptiness check.
- `Accept-Language` is read by quality, not by position — `de;q=0.5, en-GB;q=0.9`
  now resolves to `en-GB`, and `q=0` entries are skipped.
- The management API's hook PATCH declares its 400 response, so the generated
  OpenAPI spec covers the unsupported-trigger rejection it already throws.
