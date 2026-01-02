---
title: React Admin Development
description: Development guide for the AuthHero React Admin Dashboard including project structure, development workflow, building, and testing.
---

# React Admin Dashboard Development

## Development Environment

The React Admin Dashboard is built with:

- React
- React Admin framework
- TypeScript
- Vite for build tooling

## Project Structure

- `src/` - Source code directory
  - `components/` - React components
  - `dataProvider.ts` - Data provider for React Admin
  - `authProvider.ts` - Authentication provider for React Admin
  - `App.tsx` - Main application component

## Development Workflow

1. Make changes to the source code
2. Run tests to ensure functionality

```bash
pnpm test
```

3. Start the development server to see changes

```bash
pnpm dev
```

## Building for Production

Build the application for production deployment:

```bash
pnpm build
```

## Testing

Run tests with:

```bash
pnpm test
```