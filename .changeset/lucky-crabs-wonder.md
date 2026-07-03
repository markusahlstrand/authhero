---
"authhero": patch
---

Skip the /authorize resource-server check when the resolved audience is the `${iss}userinfo` sentinel. Tenants whose default_audience holds the sentinel no longer get "Service not found" on audience-less login flows — the sentinel is the userinfo-only JWT path, not a resource server.
