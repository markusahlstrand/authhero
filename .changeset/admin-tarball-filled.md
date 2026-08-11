---
"@authhero/admin": patch
---

Republish with build output included: the release workflow only built `packages/**`, so @authhero/admin (which lives in apps/) was published without its dist/ — an empty tarball. Scaffolded projects with the admin UI enabled could not copy admin assets or generate src/admin-index-html.ts. The release workflow now builds apps/admin before publishing.
