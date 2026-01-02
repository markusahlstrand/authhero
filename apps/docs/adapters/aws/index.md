---
title: AWS Adapter
description: DynamoDB-based storage for AuthHero using single-table design. Serverless-ready for Lambda and edge deployments with global distribution.
---

# AWS Adapter

The AWS adapter (`@authhero/aws-adapter`) provides DynamoDB-based storage for AuthHero. Unlike SQL adapters, it uses a NoSQL single-table design optimized for DynamoDB's access patterns.

## Key Characteristics

- **NoSQL Storage**: Uses DynamoDB's key-value model
- **Single-Table Design**: All entities stored in one table with composite keys
- **No Lucene Query Support**: Basic filtering only (not field:value syntax)
- **Serverless-Ready**: Works with AWS Lambda and Cloudflare Workers
- **Global Distribution**: Leverages DynamoDB's multi-region capabilities

## When to Use

The AWS adapter is ideal for:

- **AWS-native deployments**: Already using AWS infrastructure
- **Serverless applications**: Lambda functions and edge deployments
- **Global scalability**: DynamoDB's built-in replication
- **Basic auth flows**: Standard authentication without complex filtering needs

**Not recommended for:**
- Complex user search/filtering requirements
- Advanced Lucene-style queries
- Real-time analytics on auth data

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

// Use with AuthHero
import { Authhero } from "authhero";

const auth = new Authhero({
  data: adapters,
  // ... other config
});
```

### With Cloudflare Workers

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import createAdapters from "@authhero/aws-adapter";

export default {
  async fetch(request: Request, env: Env) {
    // Provide credentials explicitly in edge environments
    const client = new DynamoDBClient({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    const docClient = DynamoDBDocumentClient.from(client);
    
    const adapters = createAdapters(docClient, {
      tableName: env.DYNAMODB_TABLE_NAME,
    });
    
    const auth = new Authhero({
      data: adapters,
      // ... other config
    });
    
    return auth.handleRequest(request);
  },
};
```

## Table Design

The AWS adapter uses a single-table design, a DynamoDB best practice that stores all entity types in one table with composite partition and sort keys.

### Key Structure

| Entity            | PK (Partition Key)                  | SK (Sort Key)                |
| ----------------- | ----------------------------------- | ---------------------------- |
| Tenant            | `TENANT#{tenant_id}`                | `TENANT`                     |
| User              | `TENANT#{tenant_id}`                | `USER#{user_id}`             |
| Session           | `TENANT#{tenant_id}`                | `SESSION#{session_id}`       |
| Client            | `TENANT#{tenant_id}`                | `CLIENT#{client_id}`         |
| Connection        | `TENANT#{tenant_id}`                | `CONNECTION#{connection_id}` |
| Code              | `TENANT#{tenant_id}`                | `CODE#{code_id}`             |
| Password          | `TENANT#{tenant_id}#USER#{user_id}` | `PASSWORD#{password_id}`     |
| Organization      | `TENANT#{tenant_id}`                | `ORG#{organization_id}`      |
| Member            | `TENANT#{tenant_id}#ORG#{org_id}`   | `MEMBER#{user_id}`           |
| Role              | `TENANT#{tenant_id}`                | `ROLE#{role_id}`             |
| Permission        | `TENANT#{tenant_id}#ROLE#{role_id}` | `PERMISSION#{permission_id}` |

### Global Secondary Indexes

#### GSI1: Email Lookup

Enables finding users by email address within a tenant.

- **GSI1PK**: `TENANT#{tenant_id}#EMAIL#{email}`
- **GSI1SK**: `USER`

**Example Query:**
```typescript
// Find user by email in a tenant
const user = await adapters.users.getByEmail("tenant123", "user@example.com");
```

#### GSI2: Custom Domains

Enables looking up tenant configuration by custom domain.

- **GSI2PK**: `DOMAIN#{domain}`
- **GSI2SK**: `CUSTOM_DOMAIN`

**Example Query:**
```typescript
// Find tenant by custom domain
const domain = await adapters.customDomains.get("auth.example.com");
```

## DynamoDB Table Setup

### CloudFormation

```yaml
Resources:
  AuthHeroTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: authhero
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: PK
          AttributeType: S
        - AttributeName: SK
          AttributeType: S
        - AttributeName: GSI1PK
          AttributeType: S
        - AttributeName: GSI1SK
          AttributeType: S
        - AttributeName: GSI2PK
          AttributeType: S
        - AttributeName: GSI2SK
          AttributeType: S
      KeySchema:
        - AttributeName: PK
          KeyType: HASH
        - AttributeName: SK
          KeyType: RANGE
      GlobalSecondaryIndexes:
        - IndexName: GSI1
          KeySchema:
            - AttributeName: GSI1PK
              KeyType: HASH
            - AttributeName: GSI1SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
        - IndexName: GSI2
          KeySchema:
            - AttributeName: GSI2PK
              KeyType: HASH
            - AttributeName: GSI2SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true
```

### AWS CLI

```bash
aws dynamodb create-table \
  --table-name authhero \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S \
    AttributeName=GSI1SK,AttributeType=S \
    AttributeName=GSI2PK,AttributeType=S \
    AttributeName=GSI2SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    "[{\"IndexName\":\"GSI1\",\"KeySchema\":[{\"AttributeName\":\"GSI1PK\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"GSI1SK\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}},{\"IndexName\":\"GSI2\",\"KeySchema\":[{\"AttributeName\":\"GSI2PK\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"GSI2SK\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}}]" \
  --billing-mode PAY_PER_REQUEST
```

### Enable Time-to-Live (TTL)

```bash
aws dynamodb update-time-to-live \
  --table-name authhero \
  --time-to-live-specification "Enabled=true, AttributeName=ttl"
```

TTL automatically removes expired sessions and codes without additional cost.

## Query Limitations

Unlike SQL adapters with Lucene query support, the AWS adapter provides basic filtering only:

### Supported Operations

✅ **Get by ID**: `users.get(tenantId, userId)`  
✅ **Get by Email**: `users.getByEmail(tenantId, email)`  
✅ **List with pagination**: `users.list(tenantId, { page, per_page })`  
✅ **Basic filters**: Simple equality checks

### Not Supported

❌ **Lucene queries**: No `field:value` syntax  
❌ **OR queries**: No `email:user1@example.com OR email:user2@example.com`  
❌ **Comparison operators**: No `login_count:>5`  
❌ **Full-text search**: No fuzzy matching or substring searches

### Workaround for Complex Queries

If you need complex filtering:

1. **Use SQL adapter**: Switch to Kysely or Drizzle adapter
2. **Pre-filter in code**: Fetch larger result sets and filter in application code
3. **Add GSIs**: Create additional indexes for specific query patterns
4. **Use DynamoDB Streams**: Feed data to OpenSearch for advanced search

## Performance Considerations

### Optimizations

- **Single-table design**: Minimizes network round trips
- **Composite keys**: Enables efficient queries within tenant boundaries
- **GSIs**: Fast lookups for email and domain queries
- **TTL**: Automatic cleanup without scan operations

### Cost Optimization

- **On-Demand Pricing**: Pay per request, ideal for variable workloads
- **Provisioned Capacity**: Set RCU/WCU for predictable workloads to save costs
- **Projection**: GSIs project all attributes for flexibility
- **Batch Operations**: Use batch writes for bulk operations

## Error Handling

The AWS adapter converts DynamoDB errors to standard HTTPException:

```typescript
// Duplicate user (ConditionalCheckFailedException)
throw new HTTPException(409, { message: "User already exists" });

// Item not found
return null; // Rather than throwing

// Other AWS errors
throw error; // Propagates DynamoDB errors
```

## Environment Variables

Recommended configuration for AWS Lambda:

```bash
# Required
DYNAMODB_TABLE_NAME=authhero
AWS_REGION=us-east-1

# Auto-provided by Lambda runtime
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=...
```

For Cloudflare Workers:

```toml
# wrangler.toml
[vars]
AWS_REGION = "us-east-1"
DYNAMODB_TABLE_NAME = "authhero"

# Add secrets
# wrangler secret put AWS_ACCESS_KEY_ID
# wrangler secret put AWS_SECRET_ACCESS_KEY
```

## Migration from SQL

Migrating from SQL to DynamoDB:

1. **Export data**: Use SQL adapter to export all entities to JSON
2. **Create table**: Set up DynamoDB table with GSIs
3. **Transform keys**: Convert entity IDs to composite PK/SK format
4. **Batch import**: Use batch write operations to import data
5. **Verify**: Check critical flows work with new adapter
6. **Switch**: Update configuration to use AWS adapter

## Comparison with SQL Adapters

| Feature                  | AWS Adapter | Kysely/Drizzle |
| ------------------------ | ----------- | -------------- |
| Query Language           | NoSQL       | SQL            |
| Lucene Queries           | ❌          | ✅             |
| Complex Filtering        | ❌          | ✅             |
| Serverless-Optimized     | ✅          | Varies         |
| Global Distribution      | ✅          | Requires setup |
| Schema Migrations        | Not needed  | Required       |
| Local Development        | DynamoDB    | SQLite         |
| Multi-Region Active      | ✅          | Complex        |
| Cost (small scale)       | Higher      | Lower          |
| Cost (large scale)       | Optimized   | Varies         |
| Basic Auth Flows         | ✅          | ✅             |
| Advanced User Search     | ❌          | ✅             |

## Best Practices

1. **Use composite keys properly**: Always include tenant_id in partition keys for isolation
2. **Leverage GSIs**: Create indexes for common query patterns
3. **Batch operations**: Use batch write/read for bulk operations
4. **Monitor costs**: Watch RCU/WCU consumption in CloudWatch
5. **Enable TTL**: Automatically clean up expired sessions and codes
6. **Test pagination**: Ensure list operations handle `LastEvaluatedKey` correctly
7. **Error handling**: Handle `ProvisionedThroughputExceededException` with retries
8. **Local testing**: Use [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html) for development

## See Also

- [Adapter Interfaces](/adapters/interfaces/) - Standard adapter contracts
- [Writing Custom Adapters](/concepts/adapters) - Guide to creating adapters
- [Kysely Adapter](/adapters/kysely/) - SQL alternative with full query support
- [AWS SDK Documentation](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-table-read-write.html)
