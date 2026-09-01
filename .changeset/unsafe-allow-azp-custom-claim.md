---
"authhero": patch
---

Add `init({ unsafeAllowAzpCustomClaim: true })`, a transitional escape hatch
that lets hooks keep writing the `azp` claim.

`azp` became server-owned in 9.10.0, when every custom-claim write path was
routed through one shared reserved-claim set. That is the right default —
`middlewares/authentication.ts` reads `azp` as the calling client's id, so a
hook-supplied value lands in the request context where a registered client id
is expected.

But reserving it is not a no-op for a deployment that was already using it.
The mint never emits `azp` itself, so a hook was the only thing writing the
claim, and reserving the name deletes it from every token rather than
restoring a server-computed value — any downstream service reading `azp`
breaks the moment 9.10.0 ships. The flag keeps those tokens intact while
those services are moved onto a claim the hook owns.

It releases `azp` alone, on the three payloads that reserve it (access token,
ID token, client-bound service token); every other reserved name stays locked,
and internal `auth-service` mints could already override `azp`. Defaults to
`false`, so nothing changes for a deployment that is not asking for it.

**Transitional.** Enable it only where the hooks writing `azp` are first-party
code, and turn it off once the migration is done.
