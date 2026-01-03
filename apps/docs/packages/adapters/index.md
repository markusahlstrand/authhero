---
title: Adapters Overview
description: Overview of AuthHero database adapters including Kysely (recommended), Cloudflare, and Drizzle for SQL database support and multi-database compatibility.
---

# AuthHero Adapters

AuthHero provides database adapters to work with various database systems and platforms.

## Available Adapters

### Kysely Adapter (Recommended)

The **Kysely adapter** is the primary and recommended adapter for AuthHero. It supports multiple database dialects with a single schema definition:

- ✅ SQLite (including Cloudflare D1)
- ✅ PostgreSQL
- ✅ MySQL

**Why Kysely?**

- Single schema works across all databases
- Full TypeScript support with type inference
- No need to maintain separate schemas for each database

[Learn more about the Kysely Adapter →](./kysely.md)

### Cloudflare Adapter

For Cloudflare Workers-specific features and optimizations:

- Multi-tenant database isolation
- Analytics Engine integration
- Durable Objects support

[Learn more about the Cloudflare Adapter →](./cloudflare.md)

### Drizzle Adapter

> ⚠️ **Not Currently Supported**

The Drizzle adapter is not actively maintained. Drizzle ORM requires separate schema definitions for each database dialect (`pgTable`, `mysqlTable`, `sqliteTable`), which would require maintaining three separate schemas.

**Use the Kysely adapter instead** for multi-database support with a single schema.

## Overview

Adapters provide a consistent interface for AuthHero to work with different database systems. Each adapter implements the same interface but is optimized for its specific platform.

## Getting Started

Choose the adapter that matches your needs:

- **Most projects** → Use **Kysely Adapter** (works with SQLite, PostgreSQL, MySQL)
- **Cloudflare Workers with advanced features** → Use **Cloudflare Adapter** (with Kysely for database access)
- **Simple Cloudflare D1 projects** → Use **Kysely Adapter** with D1 dialect

Each adapter handles:

- Database schema creation and migrations
- CRUD operations for users, sessions, and tenant data
- Platform-specific optimizations
- Type-safe database queries
