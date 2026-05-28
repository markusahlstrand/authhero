---
"authhero": patch
"@authhero/admin": patch
---

Register the `read:/create:/update:/delete:proxy_routes` scopes on the management API resource server so they can be granted to roles and appear in access tokens (previously the proxy-routes endpoints were unreachable because the scopes were never defined). The admin role edit view now has Details, Permissions, and Raw JSON tabs, letting role permissions be managed from the UI.
