# AWS Deployment

Deploy AuthHero on Amazon Web Services using Lambda, ECS, or EC2.

## Overview

AWS offers multiple deployment options:

- **Lambda** - Serverless functions with API Gateway
- **ECS/Fargate** - Container orchestration
- **EC2** - Virtual machines with full control

## Lambda + API Gateway {#lambda}

Serverless function execution with HTTP endpoints.

### Prerequisites

- AWS Account
- AWS CLI configured
- SAM CLI or Serverless Framework

### Setup with SAM

**template.yaml:**

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
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
          DB_HOST: !GetAtt AuthHeroDB.Endpoint.Address
          DB_NAME: authhero
          DB_USER: !Ref DBUsername
          DB_PASSWORD: !Ref DBPassword
      Events:
        ApiEvent:
          Type: HttpApi
          Properties:
            Path: /{proxy+}
            Method: ANY

  AuthHeroDB:
    Type: AWS::RDS::DBInstance
    Properties:
      Engine: postgres
      EngineVersion: '15.3'
      DBInstanceClass: db.t3.micro
      AllocatedStorage: 20
      MasterUsername: !Ref DBUsername
      MasterUserPassword: !Ref DBPassword
```

**Application Code:**

```typescript
import { handle } from "hono/aws-lambda";
import { initMultiTenant } from "@authhero/multi-tenancy";
import { createAwsAdapter } from "@authhero/aws";

// Initialize outside handler for warm starts
const dataAdapter = createAwsAdapter({
  host: process.env.DB_HOST!,
  database: process.env.DB_NAME!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
});

const { app } = initMultiTenant({
  dataAdapter,
  // Serve widget from S3 or CloudFront
  widgetHandler: async (c) => {
    const path = c.req.path.replace("/u/widget/", "");
    const s3Url = `https://${process.env.WIDGET_BUCKET}.s3.amazonaws.com/widget/${path}`;
    return fetch(s3Url);
  },
});

export const handler = handle(app);
```

### Deploy

```bash
sam build
sam deploy --guided
```

### Widget Assets in S3

Upload widget files to S3:

```bash
# Copy widget files
aws s3 sync \
  node_modules/authhero/dist/assets/u/widget \
  s3://your-bucket/widget/ \
  --acl public-read

# Optional: Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/widget/*"
```

## ECS/Fargate {#ecs}

Container-based deployment for long-running services.

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
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { initMultiTenant } from "@authhero/multi-tenancy";
import { createAwsAdapter } from "@authhero/aws";

const dataAdapter = createAwsAdapter({
  host: process.env.DB_HOST!,
  database: process.env.DB_NAME!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
});

const { app } = initMultiTenant({
  dataAdapter,
  widgetHandler: serveStatic({
    root: "./node_modules/authhero/dist/assets/u/widget",
    rewriteRequestPath: (p) => p.replace("/u/widget", ""),
  }),
});

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok" }));

serve({ 
  fetch: app.fetch, 
  port: 3000 
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
          "name": "DB_HOST",
          "value": "authhero-db.cluster-xxx.us-east-1.rds.amazonaws.com"
        },
        {
          "name": "DB_NAME",
          "value": "authhero"
        }
      ],
      "secrets": [
        {
          "name": "DB_USER",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:xxx:secret:db-user"
        },
        {
          "name": "DB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:xxx:secret:db-pass"
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

## Database Options

### RDS PostgreSQL

Best for production workloads.

```typescript
const dataAdapter = createAwsAdapter({
  host: "authhero.cluster-xxx.us-east-1.rds.amazonaws.com",
  port: 5432,
  database: "authhero",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
```

**Recommended Configuration:**
- Instance: db.t3.medium or higher
- Storage: 20GB+ with autoscaling
- Multi-AZ: Enabled for production
- Backup retention: 7-30 days

### Aurora Serverless

Auto-scaling database for variable workloads.

```typescript
const dataAdapter = createAwsAdapter({
  host: "authhero.cluster-xxx.us-east-1.rds.amazonaws.com",
  database: "authhero",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
```

**Benefits:**
- Automatically scales capacity
- Pay per second
- Pauses when inactive
- Perfect for dev/staging

### DynamoDB

NoSQL option (requires custom adapter).

::: warning
DynamoDB adapter is not yet available. Use RDS/Aurora for now.
:::

## Load Balancing

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

## Monitoring

### CloudWatch Logs

All application logs go to CloudWatch automatically.

View logs:
```bash
aws logs tail /ecs/authhero --follow
```

### CloudWatch Metrics

Key metrics to monitor:
- CPU utilization
- Memory utilization
- Request count
- Error rate
- Response time

### Alarms

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name authhero-high-cpu \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```

## Cost Optimization

### Lambda

- **Free tier**: 1M requests + 400,000 GB-seconds/month
- **Cost**: ~$0.20 per 1M requests + compute time
- **Best for**: Variable traffic, <10M requests/month

### ECS Fargate

- **Cost**: ~$30-50/month for 1 task (0.25 vCPU, 0.5 GB)
- **Best for**: Predictable traffic, >10M requests/month

### RDS

- **t3.micro**: ~$15/month (dev/test)
- **t3.medium**: ~$60/month (production)
- **Aurora Serverless**: $0.12/hour when active, pauses when idle

**Recommendation:** Start with Lambda + Aurora Serverless for cost-effectiveness, migrate to ECS + RDS for scale.

## Multi-Region Deployment

Deploy to multiple regions for high availability:

1. **Database Replication**
   - Aurora Global Database
   - Cross-region read replicas

2. **Route 53 Routing**
   - Latency-based routing
   - Health checks
   - Automatic failover

3. **S3 Replication**
   - Widget assets replicated to all regions
   - CloudFront for global CDN

See [Multi-Cloud Deployment](./multi-cloud) for detailed strategies.

## Troubleshooting

### Lambda Timeout

Increase timeout in template.yaml:
```yaml
Timeout: 30  # seconds
```

### RDS Connection Issues

Check security groups:
```bash
aws ec2 describe-security-groups --group-ids sg-xxx
```

Ensure Lambda/ECS has network access to RDS.

### Widget 404 in Lambda

Serve from S3/CloudFront instead of bundling with Lambda.

## Next Steps

- [AWS Adapter documentation](../../adapters/aws/)
- [Multi-cloud setup](./multi-cloud)
- [Database migrations](../../guides/migrations)
