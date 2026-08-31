---
"@authhero/adapter-interfaces": minor
"@authhero/aws-adapter": patch
"authhero": patch
---

Add a typed `FeatureNotSupportedError` (plus an `isFeatureNotSupportedError` guard) to `@authhero/adapter-interfaces` and throw it from the AWS DynamoDB actions, action-versions and action-executions stubs, so callers can map an unimplemented feature to a 501 instead of a generic 500. The three action adapter factories are now re-exported from `@authhero/aws-adapter`'s package root alongside the other adapters. Internally, the `ensure-username` and `account-linking` template hooks now share a single `runTemplateHook` helper rather than duplicating the event stub and re-fetch.
