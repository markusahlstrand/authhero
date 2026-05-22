---
"authhero": patch
---

Wire `LogStreamDestination` into the auth-api, universal-login (u2 and legacy), and SAML outbox middlewares. Previously HTTP log streams only fired for management-api events, so login/token/signup activity never reached configured Logstash/Datadog/Loki sinks.
