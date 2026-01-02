---
title: React Admin Installation
description: Install and configure the AuthHero React Admin Dashboard. Prerequisites, installation steps, and production deployment instructions.
---

# React Admin Dashboard Installation

## Prerequisites

- Node.js (version 16 or higher)
- npm, yarn, or pnpm package manager

## Installation Steps

1. Clone the AuthHero repository or download the source code
2. Navigate to the react-admin directory

```bash
cd apps/react-admin
```

3. Install dependencies

```bash
pnpm install
```

## Configuration

Configure the dashboard to connect to your AuthHero backend by setting up the appropriate environment variables:

[Configuration details will go here]

## Running the Dashboard

Start the dashboard in development mode:

```bash
pnpm dev
```

For production deployment:

```bash
pnpm build
```

This will generate static files in the `dist` directory that can be served by any static file server.