---
"authhero": patch
---

Fix `onExecutePreUserRegistration` (and all other `config.hooks`) not firing when a sub-app (`oauthApp`, `managementApp`, `universalApp`, `u2App`, `samlApp`) is mounted or served directly. `config.hooks` — along with `samlSigner`, `poweredByLogo`, `codeExecutor`, `webhookInvoker`, and `outbox` — was previously merged into `ctx.env` only by the outer `init()` app's middleware, so consumers who routed requests straight to a sub-app saw `ctx.env.hooks` stay `undefined` and the hook silently no-op. This surfaced most visibly as social-provider callbacks (Vipps, Google, etc.) creating a user row without invoking `onExecutePreUserRegistration` — no `api.access.deny`, no `api.user.setLinkedTo`, no consumer log — while email/password worked in setups that did go through the outer app.

The fix extracts the config-merge logic into a reusable `applyConfigMiddleware(config)` and wires it into each sub-app's own middleware chain, so hooks and other config values are available regardless of how the app is mounted. Merging is idempotent when the outer app is also used.
