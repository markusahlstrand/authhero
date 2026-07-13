---
"@authhero/saml": patch
"@authhero/drizzle": patch
"@authhero/aws-adapter": patch
"authhero": patch
---

Security dependency bumps for open Dependabot alerts:

- `@authhero/saml`: fast-xml-parser `^4.5.1` → `^4.5.5` (DOCTYPE entity-encoding bypass, entity-expansion DoS) and @xmldom/xmldom 0.8.13 via xml-crypto (XML injection in serialization)
- `@authhero/drizzle`: drizzle-orm `^0.44.2` → `^0.45.2` (SQL injection via improperly escaped identifiers)
- `@authhero/aws-adapter`: @aws-sdk/client-dynamodb and @aws-sdk/lib-dynamodb `^3.700.0` → `^3.1085.0` (pulls patched fast-xml-parser 5.x)
- `authhero`: regenerated client bundle against hono 4.12.30 (CORS middleware reflected any Origin with credentials when origin defaulted to wildcard)
