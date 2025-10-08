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

The component library Storybook is integrated into the documentation site. During the build process:

1. Storybook is built from `packages/authhero`
2. Output is placed in `public/storybook/`
3. Accessible at `/storybook/` in the built site

To develop with Storybook:

```bash
# In packages/authhero directory
cd ../../packages/authhero
pnpm storybook
```

To rebuild Storybook for the docs:

```bash
# In packages/authhero directory
pnpm build-storybook
```

## Configuration

The VitePress configuration is in `.vitepress/config.ts`.
