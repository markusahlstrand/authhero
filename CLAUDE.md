# AuthHero Project Guidelines

## Build & Development
- Root dev: `pnpm dev` (runs all projects in parallel)
- Project-specific dev: `pnpm <project-name>` (e.g., `pnpm react-admin`)
- Build: `pnpm <project-name> build`

## Testing
- Run tests: `pnpm <project-name> test`
- Single test: `pnpm <project-name> test <test-file-name>`
- Vitest is used for testing with workspace config in vitest.workspace.ts

## Linting & Formatting
- Lint: `pnpm <project-name> lint`
- Format: `pnpm format` (root) or `pnpm <project-name> format`
- Type check: `pnpm <project-name> type-check`

## Code Style
- TypeScript with strict mode enabled
- React with functional components and hooks
- ESLint with TypeScript and React rules
- Prettier for consistent formatting
- Use named exports, not default exports
- Follow existing naming conventions (PascalCase for components, camelCase for functions)
- Prefer explicit error handling with try/catch
- Handle nullable values with optional chaining and nullish coalescing

## Git Workflow
- Pre-commit hook runs builds and tests
- Use Changesets for version management