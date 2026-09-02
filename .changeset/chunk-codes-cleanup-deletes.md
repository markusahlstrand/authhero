---
"@authhero/kysely-adapter": patch
---

Chunk the `codes` retention sweep on MySQL. Both deletes in `cleanupCodes` now run in 50,000-row passes until a pass comes up short, matching the `action_executions` sweep, so the first run against a large backlog no longer risks exceeding PlanetScale's per-statement limits and failing on every subsequent run. SQLite keeps the unchunked path since `DELETE ... LIMIT` needs a non-default build flag.
