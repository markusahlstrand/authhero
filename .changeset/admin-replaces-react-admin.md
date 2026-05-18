---
"@authhero/admin": minor
"create-authhero": patch
---

Make `@authhero/admin` publishable and swap it in for `@authhero/react-admin` in the Docker image and `create-authhero` templates (local + cloudflare). The shadcn-based admin is now the default UI mounted at `/admin`. `@authhero/react-admin` remains in the workspace for now but is no longer wired into Docker or generated projects.
