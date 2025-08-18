# Development Setup

This guide explains how to set up the AuthHero development environment.

## Prerequisites

- Node.js (version 16 or higher)
- npm, yarn, or pnpm package manager
- Git

## Getting the Code

1. Clone the repository:

```bash
git clone https://github.com/yourusername/authhero.git
cd authhero
```

2. Install dependencies:

```bash
pnpm install
```

## Project Structure

AuthHero is organized as a monorepo with several packages and applications:

- `packages/`: Contains the core library and adapters
- `apps/`: Contains the demo app and management dashboard

## Running the Projects

You can run all projects in parallel with:

```bash
pnpm dev
```

Or run a specific project:

```bash
pnpm <project-name>
```

For example:

```bash
pnpm react-admin
```

## Building

Build all projects:

```bash
pnpm build
```

Or build a specific project:

```bash
pnpm <project-name> build
```

## Next Steps

After setting up your development environment, you might want to:

1. Read the [code style guide](code-style.md)
2. Learn about [testing](testing.md)
3. Understand the [release process](release-process.md)