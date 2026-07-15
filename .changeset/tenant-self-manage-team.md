---
"authhero": minor
"@authhero/admin": minor
---

Let tenant admins manage their own team (#1137). A tenant's administrators are
control-plane organization members — rows a tenant shard cannot write — so this
adds a `TenantMembersBackend` seam with two implementations: a local one
(`createLocalTenantMembersBackend`) that resolves the org and mutates the
control-plane database directly (single-instance / control-plane deployments),
and a control-plane-backed one (`createControlPlaneTenantMembersAdapter`) that
delegates over the shared control-plane client for Workers-for-Platforms shards.

Server-side:
- New `/api/v2/tenant-members` management resource (list/add/remove members,
  member roles, and invitations). Every request is pinned to the caller's
  `org_name` claim server-side — a tenant-A admin cannot manage tenant B by
  swapping the `tenant-id` header.
- New authoritative `/api/v2/proxy/control-plane/tenant-members` resource
  (gated by the `controlplane:tenant_members` scope), which re-pins the org
  from the verified service token's `tenant_id` claim — a second, independent
  check. Enable it via `proxyControlPlane.tenantMembers`; enable the tenant
  resource via the top-level `tenantMembers` config.

Admin UI: a new **Team** page in the per-tenant admin lets tenant admins invite
colleagues by email, remove admins, and edit each admin's roles. The invitation
client is resolved server-side, fixing the control-plane page's "invite UI
silently disappears when the client id isn't in local storage" foot-gun.

Also adds an optional `proxyControlPlane.isTrustedIssuer(iss)` predicate (#1139)
that widens the accepted control-plane token issuers to a deployment's own
Workers-for-Platforms tenant subdomains — needed so a shard whose tokens are
signed by its own key (issuer `https://{tenant}.{host}/`) can authenticate the
write-through to the control plane. It is consulted before any JWKS fetch, so
the SSRF guarantee holds, and applies to every mounted resource (custom-domains,
tenant-members, sync).
