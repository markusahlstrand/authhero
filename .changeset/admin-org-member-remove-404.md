---
"@authhero/admin": patch
---

Fix removing an organization member failing with a 404. The data provider split the delete record id on `_` to recover a composite `<orgId>_<userId>` id, but organization ids themselves start with `org_`, so the request was sent to `/organizations/org/members` with a mangled user id. The organization id and member ids are now always resolved from the record fields in `previousData`.
