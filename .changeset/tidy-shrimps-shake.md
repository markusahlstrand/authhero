---
"@authhero/admin": patch
---

Link-user dialog searches by scoped email instead of free text

Searching a full email address in the "Link user" dialog now sends
`q=email:"…"` rather than a bare term, so the API resolves it with an indexed
lookup instead of a substring scan over the tenant's users. Partial input still
uses the free-text search.
