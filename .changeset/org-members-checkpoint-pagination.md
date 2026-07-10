---
"authhero": patch
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Fix `GET /organizations/{id}/members` ignoring `from`/`take` pagination.

The members handler only read `page`/`per_page`, so a client paging with checkpoint pagination — e.g. the Auth0 SDK, which sends `from=0&take=25` — had `take` dropped and fell back to the `per_page` default of 10, capping every response at 10 members. The handler now passes `from`/`take` through, and the `userOrganizations` list adapters (kysely and drizzle) honor them the same way the organizations adapter does (`take` wins over `per_page`, `from` over `page`, with clamping).
