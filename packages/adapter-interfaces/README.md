# @authhero/adapter-interfaces

This package provides a set of interfaces used for creating adapters for AuthHero. Adapters are used to connect AuthHero to various services, such as databases, email services, and more.

## Database adapters

The database adapters follow these rules:

- The created_at and modified_at fields are handled by the adapter when creating or updating a record.
- The tenant_id field is not part of the entities sent to the adapter.
- The entity id is passed to the adapter.
- The adapter can pass objects such as authParams. These objects will typically be flattened as part of the adapter.
- The types used in the adapters should be inferred from zod schemas to ensure type safety at runtime.
- The id column an and entity should start with the entity name, e.g. user_id for the user entity.
