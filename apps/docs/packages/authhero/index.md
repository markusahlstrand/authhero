# AuthHero Core Library

The AuthHero core library provides the main authentication functionality and API for building authentication systems.

## Features

- Authentication flows (login, signup, password reset)
- Session management
- Token handling
- Multi-tenant support
- Flexible middleware system
- Database adapter support

## Getting Started

- [Hono Variables](hono-variables.md) - Understanding context variables
- [Configuration](configuration.md) - Library configuration options
- [API Reference](api-reference.md) - Complete API documentation

## Usage

The core library is designed to be used with various web frameworks, with first-class support for Hono.

```typescript
import { createAuthHero } from 'authhero'

const auth = createAuthHero({
  // configuration
})
```
