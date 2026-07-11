---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Extract the SQL-adapter helpers that were duplicated between the kysely and drizzle packages into @authhero/adapter-interfaces: date conversion (dbDateToIso, isoToDbDate, convertDatesToAdapter, nowIso), row/entity transforms (stringifyProperties, booleanToInt, removeUndefinedAndNull, removeNullProperties, stringifyIfDefined, getCountAsInt), and the Lucene query sanitizer (sanitizeLuceneQuery). The kysely and drizzle modules now re-export the shared implementations, so their public APIs are unchanged.
