# admin

Admin UI built on `ra-core` (the headless half of react-admin) with
shadcn-admin-kit components and Tailwind v4. See the root CLAUDE.md for the
dual-router architecture.

## Component conventions

- `src/components/ui/` — shadcn/ui primitives, `src/components/admin/` —
  shadcn-admin-kit components (List, Edit, DataTable, inputs, guessers). Both
  are vendored from registries: **do not overwrite them** unless explicitly
  asked; put app-specific components elsewhere under `src/components/`.
- Before writing a custom component, check the shadcn registries for an
  existing one (via the shadcn MCP tools when available). Registry `example-*`
  items are reference material, not for direct installation.
- shadcn-admin-kit provides only UI; all logic and data fetching comes from
  `ra-core` (`<Resource>`, hooks, dataProvider).
