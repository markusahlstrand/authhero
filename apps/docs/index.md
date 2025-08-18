# AuthHero

Welcome to AuthHero! A comprehensive authentication solution that simplifies the management of authentication and user management for your applications.

## What is AuthHero?

AuthHero is a collection of packages and applications that provide a complete authentication solution. It includes:

- **Core library** for handling authentication and API requests
- **Admin dashboard** for managing authentication tenants
- **CLI tool** for creating new AuthHero projects
- **Database adapters** for various database systems
- **Demo application** showcasing AuthHero functionality

## Key Features

- Simplified authentication workflows
- Management dashboard for tenant administration
- Multiple database adapters
- Custom domain support
- API for integration with various frameworks
- Multi-tenant architecture support

## Quick Start

Get started with AuthHero in just a few steps:

1. **Install the CLI tool**
   ```bash
   npm install -g create-authhero
   ```

2. **Create a new project**
   ```bash
   create-authhero my-auth-project
   ```

3. **Start developing**
   ```bash
   cd my-auth-project
   npm run dev
   ```

## Architecture Overview

AuthHero follows a multi-tenant architecture where:

- Each tenant has its own users, applications, and settings
- Data is isolated between tenants
- Custom branding and domains are supported
- Universal login flow is implemented

[Learn more about the architecture →](./architecture.md)

## Next Steps

- [Getting Started Guide](./getting-started.md) - Detailed setup instructions
- [Concepts](./concepts.md) - Core concepts and terminology
- [API Reference](./api/overview.md) - Complete API documentation
- [Applications](./apps/react-admin/) - Explore the included applications
