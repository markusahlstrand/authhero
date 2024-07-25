# @authhero/adapter-interfaces

This package provides a set of interfaces used for creating adapters for AuthHero. Adapters are used to connect AuthHero to various services, such as databases, email services, and more.

## Database adapters

The database adapters follow these rules:

- The created_at and modified_at fields are handled by the adapter when creating or updating a record.
- The tenant_id field is not part of the entities sent to the adapter.
- The entity id is passed to the adapter.
- The adapter can pass objects such as authParams. These objects will typically be flattened as part of the adapter.
- The types used in the adapters should be inferred from zod schemas to ensure type safety at runtime.
- The id column and entity should typically start with the entity name, e.g. user_id for the user entity. We follow the naming from auth0 so it might not always be consistent.
- The adapter should typically expose the following methods.
  - `create(tenant_id: string, entity: Entity): Promise<Entity>`
  - `update(tenant_id: string, entity: Entity): Promise<boolean>`
  - `remove(tenant_id: string, entity: Entity): Promise<boolean>`
  - `get(tenant_id: string, [entity_id]: string): Promise<Entity | null>`
  - `list(tenant_id: string, query: Query): Promise<Entity[]>`
