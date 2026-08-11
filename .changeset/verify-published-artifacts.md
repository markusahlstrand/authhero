---
"create-authhero": patch
---

Verify templates against packed tarballs in CI. `scripts/scaffold-from-tarballs.mjs` packs every publishable package, scaffolds each template outside the workspace with those tarballs substituted in, installs with npm, and type-checks the result. The existing `--workspace` smoke tests cannot catch an unsatisfiable peer range (workspace links satisfy it), an empty tarball (CI built the package from source moments earlier), or a package shipping no declarations (esbuild strips types without checking them). CI also now runs `publint` and `arethetypeswrong` over every published package.
