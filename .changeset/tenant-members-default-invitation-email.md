---
"authhero": minor
---

`createLocalTenantMembersBackend` can now send tenant-member invitation emails itself. The feature is opt-in: pass the request context as `ctx`.

```ts
getBackend: (ctx) =>
  createLocalTenantMembersBackend({ ...options, ctx }),
```

With `ctx` set and no `sendInvitationEmail`, invitations go out with the built-in `user_invitation` template. They are sent as the control-plane tenant, so its email provider, branding, `default_from_address` and locales are used, not the child tenant's. A host-supplied `sendInvitationEmail` still takes precedence. `send_invitation_email: false` still sends nothing, and a failed delivery is logged without failing the invitation. `sendInvitation` also accepts an optional `tenantId`.

Existing hosts see no behaviour change: a backend built without `ctx` works exactly as before.
