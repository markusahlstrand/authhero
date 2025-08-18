# AuthHero Adapters

AuthHero provides database adapters to work with various database systems and platforms.

## Available Adapters

- **Cloudflare Adapter** - For Cloudflare Workers and D1 database
- **Drizzle Adapter** - For use with Drizzle ORM
- **Kysely Adapter** - For use with Kysely query builder

## Overview

Adapters provide a consistent interface for AuthHero to work with different database systems. Each adapter implements the same interface but is optimized for its specific platform.

## Getting Started

Choose the adapter that matches your database setup:

- If you're using Cloudflare Workers → Use Cloudflare Adapter
- If you're using Drizzle ORM → Use Drizzle Adapter  
- If you're using Kysely → Use Kysely Adapter

Each adapter handles:
- Database schema creation
- CRUD operations for users, sessions, and tenant data
- Migration support
- Platform-specific optimizations
