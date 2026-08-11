---
"@authhero/kysely-adapter": patch
"@authhero/saml": patch
---

Put the `types` condition first in the exports map. Export conditions are resolved in order, so with `types` listed after `import`/`require` TypeScript matched the JavaScript condition first and never saw the declarations — consumers on `moduleResolution: node16`/`bundler` silently got no types for these packages.
