# Adapter Interfaces

The `@authhero/adapter-interfaces` package defines the standardized interfaces that all AuthHero adapters must implement. This ensures consistency, type safety, and interoperability across different storage backends.

## Overview

Adapter interfaces provide a contract that guarantees:

- **Consistent API**: All adapters expose the same methods and types
- **Type Safety**: Full TypeScript support with compile-time validation
- **Interoperability**: Easy switching between different storage backends
- **Extensibility**: Clear guidelines for creating custom adapters

## Core Interfaces

### Database Adapter

The main database adapter interface defines methods for all data operations:

```typescript
export interface DatabaseAdapter {
  // User management
  users: UserAdapter;

  // Session management
  sessions: SessionAdapter;
  login_sessions: LoginSessionAdapter;

  // Authentication
  passwords: PasswordAdapter;
  codes: CodeAdapter;
  refresh_tokens: RefreshTokenAdapter;

  // Authorization (RBAC)
  roles: RoleAdapter;
  resource_servers: ResourceServerAdapter;
  role_permissions: RolePermissionAdapter;
  user_permissions: UserPermissionAdapter;
  user_roles: UserRoleAdapter;

  // Multi-tenancy
  tenants: TenantAdapter;
  organizations: OrganizationAdapter;

  // Configuration
  connections: ConnectionAdapter;
  themes: ThemeAdapter;
  branding: BrandingAdapter;
  custom_domains: CustomDomainAdapter;
  email_providers: EmailProviderAdapter;
  prompt_settings: PromptSettingAdapter;

  // Extensibility
  forms: FormAdapter;
  hooks: HookAdapter;

  // Security
  keys: KeyAdapter;

  // Audit
  logs: LogAdapter;
}
```

### Entity Adapters

Each entity has its own adapter interface defining CRUD operations:

```typescript
export interface UserAdapter {
  create(user: CreateUser): Promise<User>;
  get(userId: string, tenantId: string): Promise<User | null>;
  update(userId: string, tenantId: string, user: Partial<User>): Promise<User>;
  remove(userId: string, tenantId: string): Promise<void>;
  list(params: ListUsersParams): Promise<ListUsersResult>;
  findByEmail(email: string, tenantId: string): Promise<User | null>;
  findByEmailWithProvider(
    email: string,
    provider: string,
    tenantId: string,
  ): Promise<User | null>;
}

export interface SessionAdapter:
  create(session: CreateSession): Promise<Session>;
  get(sessionId: string): Promise<Session | null>;
  update(sessionId: string, session: Partial<Session>): Promise<Session>;
  remove(sessionId: string): Promise<void>;
  removeByUserId(userId: string, tenantId: string): Promise<void>;
  list(params: ListSessionsParams): Promise<ListSessionsResult>;
}
```

## Data Types

### Core Entity Types

```typescript
export interface User {
  user_id: string;
  tenant_id: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  nickname?: string;
  name?: string;
  picture?: string;
  phone_number?: string;
  phone_verified?: boolean;
  username?: string;
  created_at: string;
  updated_at: string;
  linked_to?: string;
  last_ip?: string;
  login_count: number;
  last_login?: string;
  provider: string;
  connection?: string;
  email_verified: boolean;
  is_social: boolean;
  app_metadata: Record<string, any>;
  user_metadata: Record<string, any>;
  profileData?: string;
  locale?: string;
}

export interface Session {
  id: string;
  tenant_id?: string;
  user_id?: string;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  idle_expires_at?: string;
  authenticated_at?: string;
  last_interaction_at?: string;
  used_at?: string;
  revoked_at?: string;
  device: Record<string, any>;
  clients: string[];
  login_session_id?: string;
}
```

### Input Types

```typescript
export interface CreateUser {
  user_id: string;
  tenant_id: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  provider: string;
  connection?: string;
  email_verified: boolean;
  is_social: boolean;
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}
```

### Query Parameters

```typescript
export interface ListUsersParams {
  tenant_id: string;
  page?: number;
  per_page?: number;
  include_totals?: boolean;
  sort?: string;
  search?: string;
  search_engine?: string;
  connection?: string;
  fields?: string;
  include_fields?: boolean;
}

export interface ListUsersResult {
  users: User[];
  start: number;
  limit: number;
  length: number;
  total?: number;
}
```

## RBAC Interfaces

### Role-Based Access Control

```typescript
export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface ResourceServer {
  id: string;
  tenant_id: string;
  identifier: string;
  name: string;
  scopes?: Scope[];
  signing_alg?: string;
  signing_secret?: string;
  token_lifetime?: number;
  token_lifetime_for_web?: number;
  skip_consent_for_verifiable_first_party_clients?: boolean;
  allow_offline_access?: boolean;
  verification_key?: string;
  options?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  tenant_id: string;
  resource_server_identifier: string;
  permission_name: string;
  description?: string;
}

export interface RolePermission {
  tenant_id: string;
  role_id: string;
  resource_server_identifier: string;
  permission_name: string;
  created_at: string;
}

export interface UserPermission {
  tenant_id: string;
  user_id: string;
  resource_server_identifier: string;
  permission_name: string;
  created_at: string;
}

export interface UserRole {
  tenant_id: string;
  user_id: string;
  role_id: string;
  created_at: string;
}
```

## Configuration Interfaces

### Tenant and Organization Management

```typescript
export interface Tenant {
  id: string;
  name?: string;
  audience?: string;
  sender_email?: string;
  sender_name?: string;
  language?: string;
  logo?: string;
  primary_color?: string;
  secondary_color?: string;
  support_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  tenant_id: string;
  name: string;
  display_name?: string;
  branding?: Record<string, any>;
  metadata?: Record<string, any>;
  enabled_connections?: string[];
  token_quota?: Record<string, any>;
  created_at: string;
  updated_at: string;
}
```

### Customization

```typescript
export interface Theme {
  tenant_id: string;
  theme_id: string;
  display_name: string;
  colors: ThemeColors;
  borders: ThemeBorders;
  fonts: ThemeFonts;
  page_background: ThemePageBackground;
  widget: ThemeWidget;
  created_at: string;
  updated_at: string;
}

export interface Branding {
  tenant_id: string;
  logo_url?: string;
  favicon_url?: string;
  font_url?: string;
  colors?: BrandingColors;
}

export interface CustomDomain {
  custom_domain_id: string;
  tenant_id: string;
  domain: string;
  primary: boolean;
  status: string;
  type: string;
  origin_domain_name?: string;
  verification?: Record<string, any>;
  custom_client_ip_header?: string;
  tls_policy?: string;
  domain_metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}
```

## Extensibility Interfaces

### Forms and Hooks

```typescript
export interface Form {
  id: string;
  tenant_id: string;
  name: string;
  messages?: Record<string, any>;
  languages?: string[];
  translations?: Record<string, any>;
  nodes?: FormNode[];
  start?: Record<string, any>;
  ending?: Record<string, any>;
  style?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Hook {
  hook_id: string;
  tenant_id: string;
  trigger_id: string;
  enabled: boolean;
  synchronous: boolean;
  priority?: number;
  form_id?: string;
  url?: string;
  created_at: string;
  updated_at: string;
}
```

## Validation Schemas

The interfaces include Zod schemas for runtime validation:

```typescript
import { z } from "zod";

export const userSchema = z.object({
  user_id: z.string(),
  tenant_id: z.string(),
  email: z.string().email().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  name: z.string().optional(),
  provider: z.string(),
  email_verified: z.boolean(),
  is_social: z.boolean(),
  app_metadata: z.record(z.any()).default({}),
  user_metadata: z.record(z.any()).default({}),
  created_at: z.string(),
  updated_at: z.string(),
});

export const applicationSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  name: z.string(),
  client_secret: z.string().optional(),
  callbacks: z.array(z.string()).default([]),
  allowed_origins: z.array(z.string()).default([]),
  disable_sign_ups: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
```

## Implementation Guidelines

### Creating a Custom Adapter

1. **Install the interfaces package**:

```bash
npm install @authhero/adapter-interfaces
```

2. **Implement the DatabaseAdapter interface**:

```typescript
import {
  DatabaseAdapter,
  UserAdapter,
} from "@authhero/adapter-interfaces";

export class MyCustomAdapter implements DatabaseAdapter {
  users: UserAdapter;
  // ... implement all required adapters

  constructor(config: MyAdapterConfig) {
    this.users = new MyUserAdapter(config);
    // ... initialize all adapters
  }
}
```

3. **Implement entity adapters**:

```typescript
class MyUserAdapter implements UserAdapter {
  async create(user: CreateUser): Promise<User> {
    // Implement user creation logic
  }

  async get(userId: string, tenantId: string): Promise<User | null> {
    // Implement user retrieval logic
  }

  // ... implement all required methods
}
```

4. **Use validation schemas**:

```typescript
import { userSchema } from '@authhero/adapter-interfaces';

async create(userData: CreateUser): Promise<User> {
  // Validate input
  const validatedUser = userSchema.parse(userData);

  // Store in your backend
  const storedUser = await this.storage.save(validatedUser);

  // Validate output
  return userSchema.parse(storedUser);
}
```

### Error Handling

```typescript
export class AdapterError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

// Usage
throw new AdapterError("User not found", "USER_NOT_FOUND", {
  userId,
  tenantId,
});
```

### Testing

The interfaces package includes test utilities:

```typescript
import { testDatabaseAdapter } from "@authhero/adapter-interfaces/testing";

describe("MyCustomAdapter", () => {
  it("should pass all interface tests", async () => {
    const adapter = new MyCustomAdapter(config);
    await testDatabaseAdapter(adapter);
  });
});
```

## Best Practices

1. **Type Safety**: Always use the provided TypeScript types
2. **Validation**: Use Zod schemas for runtime validation
3. **Error Handling**: Implement consistent error handling patterns
4. **Testing**: Use the provided test utilities
5. **Documentation**: Document any adapter-specific behavior
6. **Performance**: Implement efficient queries and caching strategies
7. **Transactions**: Support database transactions where possible
8. **Migrations**: Provide migration utilities for schema changes

The adapter interfaces ensure that all AuthHero implementations provide a consistent, type-safe, and reliable experience regardless of the underlying storage technology.
