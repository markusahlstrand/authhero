---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Extract the SQL-adapter helpers that were duplicated between the kysely and drizzle packages into @authhero/adapter-interfaces. The SQL-specific helpers — date conversion (dbDateToIso, isoToDbDate, convertDatesToAdapter, nowIso) and row/entity transforms (stringifyProperties, booleanToInt, removeUndefinedAndNull, removeNullProperties, stringifyIfDefined, getCountAsInt) — are published under the new `@authhero/adapter-interfaces/sql` subpath so they stay out of the main adapter-contract surface; the Lucene query sanitizer (sanitizeLuceneQuery) lives in the main export since any adapter implementing the `list({ q })` contract needs it. The kysely and drizzle modules re-export the shared implementations, so their public APIs are unchanged.
