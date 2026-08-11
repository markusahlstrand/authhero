---
"@authhero/drizzle": patch
---

Ship TypeScript declarations: the published package pointed `types` at dist/drizzle-adapter.d.ts but the build never emitted it, so consumers under `strict` failed with TS7016 (implicit any). The build now emits and bundles a declaration file (same tsc + rollup-plugin-dts pipeline as @authhero/kysely), and the exports map lists the `types` condition first as required.
