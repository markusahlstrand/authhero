# Testing

This document outlines the testing guidelines for the AuthHero project.

## Testing Framework

AuthHero uses Vitest for testing. The workspace configuration is in `vitest.workspace.ts`.

## Running Tests

Run all tests:

```bash
pnpm test
```

Run tests for a specific project:

```bash
pnpm <project-name> test
```

Run a specific test file:

```bash
pnpm <project-name> test <test-file-name>
```

## Test Structure

Tests should be organized in a way that mirrors the structure of the source code:

```
src/
  components/
    Button.tsx
    Button.test.tsx
```

## Writing Tests

### Unit Tests

Unit tests should test individual functions or components in isolation. They should be fast and have no external dependencies.

Example:

```typescript
import { describe, it, expect } from 'vitest';
import { someFunction } from './someFunction';

describe('someFunction', () => {
  it('should return the expected result', () => {
    const result = someFunction(input);
    expect(result).toBe(expectedOutput);
  });
});
```

### Integration Tests

Integration tests should test how different parts of the system work together.

### End-to-End Tests

[End-to-end testing guidelines will be documented here]

## Mocking

[Mocking guidelines will be documented here]

## Coverage

[Coverage requirements and guidelines will be documented here]