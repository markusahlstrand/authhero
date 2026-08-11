---
"@authhero/widget": patch
---

Expose type declarations from the main entrypoint and drop a dead subpath.

`exports["."]` was the bare string `./dist/index.js`. Modern resolvers prefer `exports` over the legacy top-level `types` field, so `import ... from "@authhero/widget"` resolved to JavaScript with no declarations at all, even though `dist/types/index.d.ts` was in the tarball. It is now exposed via a `types` condition.

The `./server` subpath has also been removed. Its source was deleted in "Remove unused files" but the export entry stayed behind, pointing at `dist/collection/server/index.js` and `dist/types/server/index.d.ts` — neither of which exists in the published package, so importing it always failed.
