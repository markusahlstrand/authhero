# AuthHero Documentation

This is the VitePress-powered documentation site for AuthHero.

## Development

To start the development server:

```bash
npm run dev
```

To build the static site:

```bash
npm run build
```

To preview the built site:

```bash
npm run preview
```

## Structure

- `/index.md` - Homepage
- `/getting-started.md` - Getting started guide
- `/architecture.md` - Architecture overview
- `/concepts.md` - Core concepts
- `/session-management.md` - Session and login session architecture
- `/components/` - Component library documentation (with integrated Storybook)
- `/api/` - API documentation
- `/apps/` - Application documentation
- `/packages/` - Package documentation
- `/guides/` - User guides
- `/contributing/` - Contributing guidelines
- `/auth0-comparison/` - Auth0 comparison docs

## Storybook Integration

The component library Storybook is integrated into the documentation site. The built Storybook files are **committed to the repository** in `public/storybook/` for deployment simplicity.

### Building Documentation Only

```bash
npm run build
```

This builds just the VitePress site (does not rebuild Storybook).

### Building Documentation + Storybook

```bash
npm run build:full
```

This rebuilds Storybook from `packages/authhero` and then builds VitePress.

### Developing with Storybook

To work on components with live reload:

```bash
# In packages/authhero directory
cd ../../packages/authhero
pnpm storybook
```

### When to Rebuild Storybook

Run `npm run build:full` when:
- Component stories are added or modified
- Component implementations change
- You want to update the Storybook in the docs

**Important:** After rebuilding Storybook, commit the changes in `public/storybook/` so they're deployed to production.

## Configuration

The VitePress configuration is in `.vitepress/config.ts`.
