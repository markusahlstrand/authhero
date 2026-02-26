# AWS Deployment

Deploy AuthHero on Amazon Web Services using Lambda + DynamoDB, ECS, or EC2.

## Overview

AWS offers multiple deployment options:

- **Lambda + SST** - Recommended: Serverless with DynamoDB (easiest setup)
- **Lambda + SAM** - Serverless with DynamoDB using AWS SAM
- **ECS/Fargate** - Container orchestration with DynamoDB
- **EC2** - Virtual machines with full control

All options use the `@authhero/aws` adapter with DynamoDB for data storage.

## Lambda + SST (Recommended) {#sst}

The easiest way to deploy AuthHero to AWS is using [SST](https://sst.dev) with DynamoDB.

### Quick Start

```bash
# Create new project with AWS SST template
npx create-authhero my-auth-server --template aws-sst

cd my-auth-server
npm install
npm run dev  # Deploys to AWS in development mode
```

### What SST Creates

- **DynamoDB Table** - Single-table design for all AuthHero data
- **Lambda Function** - Runs the AuthHero Hono application
- **API Gateway** - HTTP API with automatic HTTPS
- **S3 + CloudFront** - Serves widget assets globally

### Project Structure

```text
├── sst.config.ts      # Infrastructure as code
├── src/
│   ├── index.ts       # Lambda handler
│   ├── app.ts         # AuthHero configuration
│   └── seed.ts        # Database seeding
├── copy-assets.js     # Widget asset preparation
└── package.json
```

### SST Configuration

```typescript
// sst.config.ts
export default $config({
  app(input) {
    return {
      name: "authhero",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // DynamoDB Table - Single-table design
    const table = new sst.aws.Dynamo("AuthHeroTable", {
      fields: {
        pk: "string",
        sk: "string",
        gsi1pk: "string",
        gsi1sk: "string",
        gsi2pk: "string",
        gsi2sk: "string",
      },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
      globalIndexes: {
        gsi1: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
        gsi2: { hashKey: "gsi2pk", rangeKey: "gsi2sk" },
      },
      ttl: "expiresAt",
    });

    // Widget Assets on S3 + CloudFront
    const assets = new sst.aws.StaticSite("WidgetAssets", {
      path: "dist/assets",
      build: {
        command: "node copy-assets.js",
        output: "dist/assets",
      },
    });

    // API Gateway + Lambda
    const api = new sst.aws.ApiGatewayV2("AuthHeroApi");
    const authFunction = new sst.aws.Function("AuthHeroFunction", {
      handler: "src/index.handler",
      runtime: "nodejs20.x",
      timeout: "30 seconds",
      memory: "512 MB",
      link: [table],
      environment: {
        TABLE_NAME: table.name,
        WIDGET_URL: assets.url,
      },
    });
    api.route("$default", authFunction.arn);

    return { api: api.url, table: table.name };
  },
});
```

### Lambda Handler

```typescript
// src/index.ts
import { handle } from "hono/aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import createAdapters from "@authhero/aws";
import createApp from "./app";

// Initialize outside handler for connection reuse
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const dataAdapter = createAdapters(docClient, {
  tableName: process.env.TABLE_NAME!,
});

export async function handler(event, context) {
  const host = event.headers.host || event.requestContext.domainName;
  const protocol = event.headers["x-forwarded-proto"] || "https";
  const origin = event.headers.origin || "";

  const app = createApp({
    dataAdapter,
    allowedOrigins: [
      "http://localhost:5173",
      "https://manage.authhero.net",
      origin,
    ].filter(Boolean),
    widgetUrl: process.env.WIDGET_URL || "",
  });

  process.env.ISSUER = `${protocol}://${host}/`;
  return handle(app)(event, context);
}
```

### Seeding the Database

After `sst dev` deploys the infrastructure:

```bash
# Get TABLE_NAME from SST output
TABLE_NAME=<your-table> \
ADMIN_USERNAME=admin \
npm run seed
```

### Production Deployment

```bash
npm run deploy -- --stage production
```

### Custom Domain

```typescript
const api = new sst.aws.ApiGatewayV2("AuthHeroApi", {
  domain: "auth.yourdomain.com",
});
```

---

## Lambda + SAM {#lambda}

Alternative setup using AWS SAM with DynamoDB.

### Prerequisites

- AWS Account
- AWS CLI configured
- SAM CLI (`pip install aws-sam-cli`)

### Setup with SAM

**template.yaml:**

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31

Parameters:
  Stage:
    Type: String
    Default: dev

Resources:
  # DynamoDB Table - Single-table design
  AuthHeroTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "authhero-${Stage}"
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: pk
          AttributeType: S
        - AttributeName: sk
          AttributeType: S
        - AttributeName: gsi1pk
          AttributeType: S
        - AttributeName: gsi1sk
          AttributeType: S
        - AttributeName: gsi2pk
          AttributeType: S
        - AttributeName: gsi2sk
          AttributeType: S
      KeySchema:
        - AttributeName: pk
          KeyType: HASH
        - AttributeName: sk
          KeyType: RANGE
      GlobalSecondaryIndexes:
        - IndexName: gsi1
          KeySchema:
            - AttributeName: gsi1pk
              KeyType: HASH
            - AttributeName: gsi1sk
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
        - IndexName: gsi2
          KeySchema:
            - AttributeName: gsi2pk
              KeyType: HASH
            - AttributeName: gsi2sk
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
      TimeToLiveSpecification:
        AttributeName: expiresAt
        Enabled: true

  # S3 Bucket for Widget Assets
  WidgetBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "authhero-widgets-${Stage}-${AWS::AccountId}"
      PublicAccessBlockConfiguration:
        BlockPublicAcls: false
        BlockPublicPolicy: false
        IgnorePublicAcls: false
        RestrictPublicBuckets: false

  WidgetBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref WidgetBucket
      PolicyDocument:
        Statement:
          - Effect: Allow
            Principal: "*"
            Action: s3:GetObject
            Resource: !Sub "${WidgetBucket.Arn}/*"

  # Lambda Function
  AuthHeroFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./
      Handler: dist/index.handler
      Runtime: nodejs20.x
      MemorySize: 512
      Timeout: 30
      Environment:
        Variables:
          TABLE_NAME: !Ref AuthHeroTable
          WIDGET_URL: !GetAtt WidgetBucket.WebsiteURL
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref AuthHeroTable
      Events:
        ApiEvent:
          Type: HttpApi
          Properties:
            Path: /{proxy+}
            Method: ANY

Outputs:
  ApiUrl:
    Value: !Sub "https://${ServerlessHttpApi}.execute-api.${AWS::Region}.amazonaws.com"
  TableName:
    Value: !Ref AuthHeroTable
  WidgetBucket:
    Value: !Ref WidgetBucket
```

**Application Code:**

```typescript
// src/index.ts
import { handle } from "hono/aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import createAdapters from "@authhero/aws";
import { init } from "authhero";

// Initialize outside handler for warm starts
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const dataAdapter = createAdapters(docClient, {
  tableName: process.env.TABLE_NAME!,
});

const { app } = init({
  dataAdapter,
  allowedOrigins: ["http://localhost:5173", "https://manage.authhero.net"],
});

// Redirect widget requests to S3
app.get("/u/widget/*", async (c) => {
  const file = c.req.path.replace("/u/widget/", "");
  return c.redirect(`${process.env.WIDGET_URL}/u/widget/${file}`);
});

app.get("/u/*", async (c) => {
  const file = c.req.path.replace("/u/", "");
  return c.redirect(`${process.env.WIDGET_URL}/u/${file}`);
});

export const handler = handle(app);
```

### Deploy

```bash
# Build TypeScript
npm run build

# Deploy with SAM
sam build
sam deploy --guided

# Upload widget assets to S3
aws s3 sync node_modules/authhero/dist/assets s3://<widget-bucket>/ --acl public-read
```

---

## ECS/Fargate {#ecs}

Container-based deployment for long-running services with DynamoDB.

### Prerequisites

- Docker installed
- ECR repository created
- ECS cluster set up

### Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Widget assets included in node_modules
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

CMD ["node", "dist/index.js"]
```

### Application Code

```typescript
// src/index.ts
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import createAdapters from "@authhero/aws";
import { init } from "authhero";

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const dataAdapter = createAdapters(docClient, {
  tableName: process.env.TABLE_NAME!,
});

const { app } = init({
  dataAdapter,
  allowedOrigins: ["http://localhost:5173", "https://manage.authhero.net"],
});

// Serve widget from node_modules (available in container)
app.get(
  "/u/widget/*",
  serveStatic({
    root: "./node_modules/authhero/dist/assets/u/widget",
    rewriteRequestPath: (p) => p.replace("/u/widget", ""),
  }),
);

app.get(
  "/u/*",
  serveStatic({
    root: "./node_modules/authhero/dist/assets/u",
    rewriteRequestPath: (p) => p.replace("/u", ""),
  }),
);

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok" }));

serve({
  fetch: app.fetch,
  port: 3000,
});
```

### Task Definition

```json
{
  "family": "authhero",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::xxx:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::xxx:role/authhero-task-role",
  "containerDefinitions": [
    {
      "name": "authhero",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/authhero:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "TABLE_NAME",
          "value": "authhero-prod"
        },
        {
          "name": "AWS_REGION",
          "value": "us-east-1"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/authhero",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### IAM Policy for Task Role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:xxx:table/authhero-prod",
        "arn:aws:dynamodb:us-east-1:xxx:table/authhero-prod/index/*"
      ]
    }
  ]
}
```

### Deploy

```bash
# Build and push image
docker build -t authhero .
docker tag authhero:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/authhero:latest
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/authhero:latest

# Update service
aws ecs update-service \
  --cluster authhero-cluster \
  --service authhero-service \
  --force-new-deployment
```

---

## DynamoDB Table Setup

All AWS deployments use DynamoDB with a single-table design. If you're not using SST or SAM, create the table manually:

```bash
aws dynamodb create-table \
  --table-name authhero \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=sk,AttributeType=S \
    AttributeName=gsi1pk,AttributeType=S \
    AttributeName=gsi1sk,AttributeType=S \
    AttributeName=gsi2pk,AttributeType=S \
    AttributeName=gsi2sk,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --global-secondary-indexes \
    "[{\"IndexName\":\"gsi1\",\"KeySchema\":[{\"AttributeName\":\"gsi1pk\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"gsi1sk\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}},{\"IndexName\":\"gsi2\",\"KeySchema\":[{\"AttributeName\":\"gsi2pk\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"gsi2sk\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}}]" \
  --billing-mode PAY_PER_REQUEST
```

### Enable TTL

```bash
aws dynamodb update-time-to-live \
  --table-name authhero \
  --time-to-live-specification Enabled=true,AttributeName=expiresAt
```

---

## Load Balancing (ECS)

### Application Load Balancer

```bash
# Create target group
aws elbv2 create-target-group \
  --name authhero-targets \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-xxx \
  --health-check-path /health

# Create load balancer
aws elbv2 create-load-balancer \
  --name authhero-lb \
  --subnets subnet-xxx subnet-yyy \
  --security-groups sg-xxx
```

### SSL/TLS Certificate

Use AWS Certificate Manager:

```bash
aws acm request-certificate \
  --domain-name auth.example.com \
  --validation-method DNS
```

---

## Auto Scaling

### ECS Service Auto Scaling

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/authhero-cluster/authhero-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10

# Create scaling policy
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/authhero-cluster/authhero-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name authhero-cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://scaling-policy.json
```

### DynamoDB Auto Scaling

DynamoDB with `PAY_PER_REQUEST` billing mode automatically scales. For provisioned capacity:

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace dynamodb \
  --resource-id table/authhero \
  --scalable-dimension dynamodb:table:ReadCapacityUnits \
  --min-capacity 5 \
  --max-capacity 100
```

---

## Monitoring

### CloudWatch Logs

View Lambda logs:

```bash
aws logs tail /aws/lambda/authhero --follow
```

View ECS logs:

```bash
aws logs tail /ecs/authhero --follow
```

### CloudWatch Metrics

Key metrics to monitor:

- **Lambda**: Invocations, Duration, Errors, Throttles
- **DynamoDB**: ConsumedReadCapacity, ConsumedWriteCapacity, ThrottledRequests
- **ECS**: CPUUtilization, MemoryUtilization

### Alarms

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name authhero-lambda-errors \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=authhero
```

---

## Cost Estimation

### Lambda + DynamoDB

| Component       | Free Tier         | After Free Tier    |
| --------------- | ----------------- | ------------------ |
| Lambda          | 1M requests/month | $0.20/1M requests  |
| DynamoDB        | 25 WCU/RCU        | ~$0.25/1M requests |
| API Gateway     | 1M requests/month | $1.00/1M requests  |
| S3 + CloudFront | 1GB + 50GB        | ~$5/month          |

**Estimate for 1M auth requests/month**: ~$10-15/month

### ECS Fargate + DynamoDB

| Component                  | Cost         |
| -------------------------- | ------------ |
| Fargate (0.25 vCPU, 0.5GB) | ~$10/month   |
| DynamoDB (PAY_PER_REQUEST) | ~$5-10/month |
| ALB                        | ~$20/month   |

**Estimate**: ~$35-50/month

**Recommendation**: Start with Lambda + SST for cost-effectiveness and simplicity.

---

## Multi-Region Deployment

Deploy to multiple regions for high availability:

### DynamoDB Global Tables

```bash
# Create global table
aws dynamodb create-global-table \
  --global-table-name authhero \
  --replication-group RegionName=us-east-1 RegionName=eu-west-1
```

### Route 53 Routing

- Latency-based routing
- Health checks on each region's API
- Automatic failover

See [Multi-Cloud Deployment](./multi-cloud) for detailed strategies.

---

## Troubleshooting

### Lambda Timeout

Increase timeout in your configuration:

**SST:**

```typescript
timeout: "30 seconds",
```

**SAM:**

```yaml
Timeout: 30
```

### DynamoDB Throttling

- Check CloudWatch for `ThrottledRequests`
- Enable auto-scaling or switch to `PAY_PER_REQUEST`
- Review access patterns for hot partitions

### Widget 404 in Lambda

Lambda cannot serve static files from node_modules. Serve from S3/CloudFront:

```typescript
app.get("/u/widget/*", async (c) => {
  const file = c.req.path.replace("/u/widget/", "");
  return c.redirect(`${process.env.WIDGET_URL}/u/widget/${file}`);
});
```

### Permission Denied

Ensure Lambda/ECS has IAM permissions for DynamoDB:

```json
{
  "Effect": "Allow",
  "Action": ["dynamodb:*"],
  "Resource": "arn:aws:dynamodb:*:*:table/authhero*"
}
```

---

## Next Steps

- [AWS Adapter documentation](../adapters/aws/)
- [Multi-cloud setup](./multi-cloud)
- [Widget assets configuration](./widget-assets)
