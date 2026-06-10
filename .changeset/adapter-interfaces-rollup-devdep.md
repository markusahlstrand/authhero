---
"@authhero/adapter-interfaces": patch
---

Add `rollup` as an explicit devDependency so the build works on CI where the peer dependency of `rollup-plugin-dts` is not auto-hoisted.
