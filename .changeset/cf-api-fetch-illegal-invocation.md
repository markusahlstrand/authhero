---
"@authhero/cloudflare-adapter": patch
---

Fix "Illegal invocation" in CloudflareApiClient when running inside Cloudflare Workers. The default fetch was stored as an instance property and invoked as a method, binding `this` to the client instance — workerd's brand check rejects this, so every CF API call (D1 create/delete, script upload, secrets) failed at runtime in a Worker. The default is now a wrapper that calls the global fetch with the correct `this`. Passing a `fetch: (input, init) => fetch(input, init)` workaround to `createCloudflareWfpD1Provisioner` is no longer necessary.
