---
"authhero": minor
---

Publish WFP tenant-subdomain dispatch routes automatically

New helpers so a WFP tenant's platform subdomain (`{tenant_id}.{issuerHost}`) routes to its own Worker without a manual `custom_domains`/`proxy_routes` entry:

- `createWfpTenantHostResolver` — resolves a ready WFP tenant's subdomain to a synthetic `ResolvedHost` whose single route dispatches via the proxy's `dispatch_namespace` handler; derived entirely from the tenant row.
- `wrapTenantsAdapterWithWfpKvPublish` — tenants-adapter counterpart of `wrapProxyAdaptersWithKvPublish`: the provisioner's `provisioning_state: "ready"` write-back publishes the KV blob, a remove (or wfp → shared flip) deletes it.
- `composeHostResolvers` — chains resolvers (custom domains first) so one composed `resolveHost` serves the HTTP endpoint, both KV publishers, and the reconcile.
- `wfpTenantHost` — canonical host derivation for reconcile host lists.

Previously nothing published these hosts, so tenant subdomains silently fell through to the proxy's default-forward chain (the shared control plane) even after the tenant Worker was provisioned.
