---
title: AuthHero Installation
description: Install the AuthHero package using npm, yarn, or pnpm. Requirements, basic usage, and next steps for configuration.
---

# AuthHero Installation

## Requirements

- Node.js (version 16 or higher)
- npm, yarn, or pnpm package manager

## Installation

Install the AuthHero package in your project:

```bash
pnpm add authhero
```

Or using npm:

```bash
npm install authhero
```

Or using yarn:

```bash
yarn add authhero
```

## Basic Usage

Here's a basic example of integrating AuthHero in your application:

```typescript
import { AuthHero } from 'authhero';

// Configuration details will go here

const authHero = new AuthHero(config);

// Authentication methods will be shown here
```

## Next Steps

After installation, you'll need to configure AuthHero for your specific use case. See the [Configuration](configuration.md) page for details.