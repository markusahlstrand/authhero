# Create AuthHero CLI Usage

## Prerequisites

- Node.js (version 16 or higher)
- npm, yarn, or pnpm package manager

## Creating a New Project

To create a new AuthHero project, use the following command:

```bash
pnpm create authhero my-auth-app
```

Or using npx:

```bash
npx create-authhero my-auth-app
```

Or using yarn:

```bash
yarn create authhero my-auth-app
```

This will create a new directory `my-auth-app` with a basic AuthHero setup.

## Configuration During Setup

The CLI will prompt you for various configuration options:

- **Select a template**: Choose from different project templates
- **Select a database adapter**: Choose the database adapter for your project
- **Configure authentication settings**: Set up the basic authentication settings

## Post-Creation Steps

After creating the project, navigate to the project directory and install dependencies:

```bash
cd my-auth-app
pnpm install
```

Start the development server:

```bash
pnpm dev
```

## Next Steps

After creating your project, you may want to:

1. Set up your database connection
2. Configure your authentication settings
3. Customize your authentication flows

See the main documentation for details on these topics.