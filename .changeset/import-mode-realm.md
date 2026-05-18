---
"@authhero/adapter-interfaces": patch
"authhero": patch
"@authhero/admin": patch
---

Add optional `options.configuration.realm` to connections. When set on an import-mode DB connection, it overrides the `realm` sent in the upstream password-realm grant (which previously always defaulted to the connection name). Exposed in the admin UI under the Import Mode credentials section.
