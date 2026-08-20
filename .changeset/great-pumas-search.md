---
"authhero": patch
---

Keep linked-user clusters a single hop deep, and resolve corrupt ones defensively (#1250)

`linked_to` is now written in exactly one place. The user-update decorator routes
every single-field `linked_to` update through a `linkUserTo` chokepoint that
resolves the target to its cluster root and repoints the demoted user's own
secondaries first, atomically. Callers get the invariant by construction instead
of by remembering to call `repointPrimary`, which is now internal.

This fixes `POST /api/v2/users/{user_id}/identities`, which did a bare
`linked_to` write: linking a user that had linked identities of its own stranded
them behind a now-secondary parent, where they fell out of the API entirely —
absent from `GET /users` (they carry a `linked_to`) and from every primary's
`identities[]`. The endpoint now also returns 404 when the target is itself a
linked identity, matching `GET` and `PATCH` on the same user. Creating a user
with `linked_to` pointing at a secondary resolves to the root instead of nesting.

Resolution follows the chain transitively with a depth cap and cycle guard, so
data already corrupted by the above degrades to the canonical identity rather
than mis-resolving. Previously the token flows followed a single hop and minted
tokens whose `sub` named a mid-chain identity — which downstream systems keyed
on `sub` read as a different person. Covers the authorization-code, refresh-token,
silent, token-exchange and password flows, `/userinfo`, and account-linking
candidate selection.
