---
"authhero": patch
---

Refresh-token grant now overlaps its independent backend round-trips. The user
read and the login-session read are fired together (the login session is keyed
on data already in hand), and on rotation the child-token insert and the
parent-token update — which touch different rows — run concurrently instead of
back-to-back. On a deployment where each database round-trip costs ~350 ms
(Workers → PlanetScale over HTTP), this removes roughly two serial round-trips
from every `/oauth/token` refresh exchange. No change to behaviour or the number
of queries issued.
