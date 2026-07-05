---
"@authhero/admin": minor
---

Add a control-plane Operations page per tenant (issue #1026 phase 5): lifecycle operation history with expandable step-event timelines, live polling while an operation is in flight, and a Redeploy button that enqueues an upgrade operation. The data provider gains `listTenantOperations` / `getTenantOperation` / `createTenantOperation`, and the tenants list links to the new page. Full-page loads of `/tenants/:id/members` and `/tenants/:id/operations` now render the control-plane app correctly.
