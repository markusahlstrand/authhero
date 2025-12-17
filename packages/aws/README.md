# @authhero/aws-adapter

AWS DynamoDB adapter for AuthHero. This adapter implements the AuthHero data adapters using Amazon DynamoDB as the storage backend.

## Features

- Single-table design for efficient DynamoDB usage
- Works with AWS Lambda and Cloudflare Workers
- Type-safe with full TypeScript support

## Installation

```bash
npm install @authhero/aws-adapter
# or
pnpm add @authhero/aws-adapter
```

## Usage

### With AWS Lambda

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import createAdapters from "@authhero/aws-adapter";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const adapters = createAdapters(docClient, {
  tableName: "authhero",
});
```

### With Cloudflare Workers

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import createAdapters from "@authhero/aws-adapter";

// In Cloudflare Workers, you need to provide credentials explicitly
const client = new DynamoDBClient({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});
const docClient = DynamoDBDocumentClient.from(client);

const adapters = createAdapters(docClient, {
  tableName: "authhero",
});
```

## Table Design

This adapter uses a single-table design with the following key structure:

| Entity     | PK                                  | SK                           |
| ---------- | ----------------------------------- | ---------------------------- |
| Tenant     | `TENANT#{tenant_id}`                | `TENANT`                     |
| User       | `TENANT#{tenant_id}`                | `USER#{user_id}`             |
| Session    | `TENANT#{tenant_id}`                | `SESSION#{session_id}`       |
| Client     | `TENANT#{tenant_id}`                | `CLIENT#{client_id}`         |
| Connection | `TENANT#{tenant_id}`                | `CONNECTION#{connection_id}` |
| Code       | `TENANT#{tenant_id}`                | `CODE#{code_id}`             |
| Password   | `TENANT#{tenant_id}#USER#{user_id}` | `PASSWORD#{password_id}`     |
| ...        | ...                                 | ...                          |

### Global Secondary Indexes

- **GSI1**: For querying by email across users
  - GSI1PK: `TENANT#{tenant_id}#EMAIL#{email}`
  - GSI1SK: `USER`

- **GSI2**: For querying custom domains
  - GSI2PK: `DOMAIN#{domain}`
  - GSI2SK: `CUSTOM_DOMAIN`

## DynamoDB Table Setup

Create a DynamoDB table with the following configuration:

```json
{
  "TableName": "authhero",
  "KeySchema": [
    { "AttributeName": "PK", "KeyType": "HASH" },
    { "AttributeName": "SK", "KeyType": "RANGE" }
  ],
  "AttributeDefinitions": [
    { "AttributeName": "PK", "AttributeType": "S" },
    { "AttributeName": "SK", "AttributeType": "S" },
    { "AttributeName": "GSI1PK", "AttributeType": "S" },
    { "AttributeName": "GSI1SK", "AttributeType": "S" },
    { "AttributeName": "GSI2PK", "AttributeType": "S" },
    { "AttributeName": "GSI2SK", "AttributeType": "S" }
  ],
  "GlobalSecondaryIndexes": [
    {
      "IndexName": "GSI1",
      "KeySchema": [
        { "AttributeName": "GSI1PK", "KeyType": "HASH" },
        { "AttributeName": "GSI1SK", "KeyType": "RANGE" }
      ],
      "Projection": { "ProjectionType": "ALL" }
    },
    {
      "IndexName": "GSI2",
      "KeySchema": [
        { "AttributeName": "GSI2PK", "KeyType": "HASH" },
        { "AttributeName": "GSI2SK", "KeyType": "RANGE" }
      ],
      "Projection": { "ProjectionType": "ALL" }
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
```

## License

MIT
