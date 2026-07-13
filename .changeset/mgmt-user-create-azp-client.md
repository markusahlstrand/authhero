---
"authhero": patch
---

Fix management API user creation returning 403 "Client not found" when the token's `azp` claim names a client that doesn't exist in the target tenant (e.g. control-plane dashboard tokens against WFP tenants). A non-resolving `client_id` is now treated as a management call — signup validation only runs when the client actually exists in the tenant, matching Auth0's behavior of bypassing signup restrictions for management API user creation.
