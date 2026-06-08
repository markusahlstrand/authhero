---
"@authhero/adapter-interfaces": minor
"authhero": minor
---

Add `okta` as a first-class enterprise strategy. Okta connections use the
shared OIDC handler internally but register under the `okta` strategy name so
user_ids match Auth0's wire format (`okta|<sub>`). Required for migrations
from Auth0 tenants that have Okta enterprise connections — without this the
connection couldn't be created and `getStrategy` would throw `Strategy okta
not found` at login.
