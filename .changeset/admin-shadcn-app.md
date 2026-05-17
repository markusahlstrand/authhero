---
"@authhero/react-admin": patch
---

Add new `@authhero/admin` app at `apps/admin/` built with [shadcn-admin-kit](https://marmelab.com/shadcn-admin-kit/) (ra-core + shadcn/ui + Tailwind). It ports the full surface of `apps/react-admin` — tenants, users, clients, connections, custom domains, organizations, roles, actions, action-triggers, hooks, flows, forms, branding, prompts, resource servers + scopes, sessions, signing keys, attack protection, email providers, settings, logs, analytics — using idiomatic shadcn components. Specialized panels (client-grants management, FlowEditor/NodeEditor, Tiptap rich text, branding preview, action versions/test, log replay) ship as basic CRUD shells in this iteration. `apps/react-admin` is unchanged and will be removed once parity is reached.

Run with `pnpm admin dev`.
