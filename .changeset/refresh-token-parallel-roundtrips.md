---
"authhero": patch
---

Refresh-token grant now overlaps its independent backend round-trips. The user
read and the login-session read are fired together (the login session is keyed
on data already in hand). On a deployment where each database round-trip costs ~350 ms
(Workers → PlanetScale over HTTP), this removes roughly one serial round-trip
from every `/oauth/token` refresh exchange. Token rotation writes remain
sequential (child insert before parent update) to prevent marking a parent as
rotated without a successfully created child. No change to behaviour or the number
of queries issued.
