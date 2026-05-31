---
"@authhero/admin": patch
---

Admin UI: detect CIMD clients (via `client_metadata.cimd === "true"` marker set by the auth backend) and show a banner on the client edit page explaining that configuration is managed via the metadata document URL.
