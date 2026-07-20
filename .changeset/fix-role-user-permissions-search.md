---
"@authhero/admin": patch
---

Fix permissions search on the role and user permissions tabs. The `q` search query was written to the URL but ignored by the data provider, so typing in the search box never filtered the list. The role- and user-permissions branches now route through the shared client-side list handler, filtering on permission name, description, and resource server, and gain client-side sorting.
