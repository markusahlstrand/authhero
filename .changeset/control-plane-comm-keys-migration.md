---
"@authhero/kysely-adapter": patch
---

Add the `control_plane_comm_keys` migration: the registry of per-tenant control-plane-communication public keys, so a WFP shard's write-through calls can be verified locally by the control plane (#1139).
