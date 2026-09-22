---
"authhero": minor
---

The proxy control-plane `tenant-members` resource can now send invitation emails without a host-supplied sender: pass the request context as `ctx` to `createLocalTenantMembersBackend` in `proxyControlPlane.tenantMembers.getBackend` (`getBackend: (c) => createLocalTenantMembersBackend({ ...options, ctx: c })`), and WFP shards' invitations are emailed with the `user_invitation` template as the control-plane tenant. The email, logging and service-token helpers now accept a narrower request context in which every request variable is optional. `TenantMembersControlPlaneOptions.authenticate` is now optional: it defaults to the built-in `controlplane:tenant_members` bearer-token check, and `createProxyControlPlaneApp` keeps applying that check itself, so hosts no longer need to pass a stub.
