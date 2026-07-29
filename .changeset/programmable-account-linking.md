---
"@authhero/adapter-interfaces": minor
"authhero": minor
"@authhero/cloudflare-adapter": patch
---

Allow account linking from a `post-user-login` code hook (action).

Tenants that need custom linking policy (link only within a domain, only for
certain connections, only when an `app_metadata` flag is set, …) can now
implement it as a user-authored action, alongside the existing built-in
`account-linking` template hook. Fixes #1184.

- **Opt-in.** Set `metadata.resolve_link_candidates: true` on a `post-user-login`
  code hook. Only then does AuthHero run the extra same-email lookup and expose
  `event.link_candidates` — an array of the primary accounts the built-in policy
  would consider (oldest flagged `is_oldest`). Existing code hooks see no
  behaviour or latency change and pay no extra query.
- **New verb.** `api.user.setLinkedTo(primaryUserId)` is now available at
  `post-user-login`. The action reads `event.link_candidates` and links to one
  of them.
- **Guarded host-side.** The write rejects any `primaryUserId` not present in
  `event.link_candidates` (logging `FAILED_HOOK`) so an action can't be turned
  into an account-takeover primitive; it enforces the verified-email gate
  server-side regardless of what the action asserts; it uses "older account
  wins" direction via `repointPrimary` (no 2-hop chains); and it is idempotent.
  After linking, the resulting primary is re-fetched so downstream token
  building sees it.
- `userLinkingMode: "off"` still only suppresses the built-in email→primary
  lookup — explicit action/template linking remains available.

Internals: the per-trigger code-hook API allowlist, previously duplicated across
both executors, is now a single `TRIGGER_API_SHAPES` source of truth in
`@authhero/adapter-interfaces` (with a `LinkCandidate` type), and code-hook API
replay now awaits each call so `setLinkedTo`'s writes complete before the login
response is built.
