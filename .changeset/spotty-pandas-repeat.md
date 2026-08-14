---
"@authhero/cloudflare-adapter": patch
---

Make custom-domain create idempotent instead of failing with an opaque 500 on a duplicate.

- A domain that already has a record answers 409 (as Auth0 does) without reaching
  Cloudflare. The check is zone-wide, not tenant-scoped, since a hostname is unique
  across the zone.
- When Cloudflare rejects the hostname as already existing in the zone but no tenant has
  a record for it — the orphan left behind when a create dies between the Cloudflare call
  and the writes that follow — the hostname is looked up and adopted rather than
  rejected. Previously every retry hit the same rejection, so one transient failure made
  the domain permanently unregisterable. On enterprise zones a hostname stamped with a
  different tenant_id is never adopted.
