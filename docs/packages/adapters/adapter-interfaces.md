# Adapter Interfaces

The `adapter-interfaces` package defines the interfaces that all AuthHero adapters must implement. These interfaces provide a consistent API for AuthHero to interact with different database systems.

## Core Interfaces

### `Adapter`

The main adapter interface that combines all specialized adapters:

```typescript
interface Adapter extends 
  UserAdapter, 
  ApplicationAdapter, 
  ConnectionAdapter, 
  DomainAdapter, 
  TokenAdapter {
  // Common methods
}
```

### `UserAdapter`

Interface for user management operations:

```typescript
interface UserAdapter {
  createUser(data: UserCreate): Promise<User>;
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUser(id: string, data: UserUpdate): Promise<User>;
  deleteUser(id: string): Promise<void>;
  // Other user methods
}
```

### `ApplicationAdapter`

Interface for application management operations:

```typescript
interface ApplicationAdapter {
  createApplication(data: ApplicationCreate): Promise<Application>;
  getApplication(id: string): Promise<Application | null>;
  updateApplication(id: string, data: ApplicationUpdate): Promise<Application>;
  deleteApplication(id: string): Promise<void>;
  // Other application methods
}
```

[Other adapter interfaces will be documented here]

## Creating a Custom Adapter

To create a custom adapter, you need to implement all the required interfaces:

```typescript
import { Adapter } from 'authhero-adapter-interfaces';

class MyCustomAdapter implements Adapter {
  // Implement all required methods
}
```

## Data Types

The adapter interfaces use several common data types:

[Data type definitions will be documented here]