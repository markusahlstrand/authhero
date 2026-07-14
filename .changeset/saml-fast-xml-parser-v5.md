---
"@authhero/saml": patch
---

Migrate from fast-xml-parser v4 to v5 (^5.7.0). Resolves the remaining Dependabot alert (XMLBuilder XML comment/CDATA injection via unescaped delimiters), which is only patched on the v5 line. No API changes: parser options and the preserveOrder builder structures are unchanged between v4 and v5.
