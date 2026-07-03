# ui-widget

Stencil web component (`<authhero-widget>`) that renders server-driven auth
screens.

## Schema: Auth0 Forms

Screens follow the **Auth0 Forms component schema**
(https://auth0.com/docs/customize/forms/forms-schema). The type source of truth
is `packages/adapter-interfaces/src/types/Forms.ts`; this package only
re-exports those types via `src/types/components.ts`. Schema changes go in
`adapter-interfaces`, never here.

(An early version targeted the Ory Kratos UI node schema — that direction was
abandoned. Ignore any Ory references in old branches or PRs.)

## Pure UI — no auth logic

The widget renders a `UiScreen` JSON (title, components, messages, links) and
emits generic events (`formSubmit`, `buttonClick`, `linkClick`, `navigate`,
`flowComplete`, `flowError`, `screenChange`). The server decides which screen
comes next; keep auth-flow logic out of this package.

## Development

- Tests use **Stencil's test runner**, not Vitest: `pnpm test` (this package is
  excluded from the repo's Vitest workspace).
- `pnpm dev` builds the widget in watch mode and serves the demo at
  http://localhost:3456/u2/login/identifier (mock flow + live theme panel).
