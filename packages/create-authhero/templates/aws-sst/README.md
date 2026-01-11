# AuthHero - AWS SST (Lambda + DynamoDB)

A serverless AuthHero deployment using [SST](https://sst.dev) with AWS Lambda and DynamoDB.

## Prerequisites

- Node.js 18+
- AWS CLI configured with credentials
- An AWS account

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start development mode**

   ```bash
   npm run dev
   ```

   This will:
   - Deploy to your AWS account in development mode
   - Create a DynamoDB table
   - Start a Lambda function with live reloading
   - Output your API URL

3. **Seed the database**

   After the dev server starts, seed your database:

   ```bash
   # Set your admin credentials
   export ADMIN_EMAIL=admin@example.com
   export ADMIN_PASSWORD=your-secure-password

   npm run seed
   ```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start SST in development mode |
| `npm run deploy` | Deploy to production |
| `npm run remove` | Remove all deployed resources |
| `npm run seed` | Seed the database with initial data |

## Project Structure

```
├── sst.config.ts      # SST configuration (Lambda, DynamoDB, API Gateway)
├── src/
│   ├── index.ts       # Lambda handler
│   ├── app.ts         # AuthHero app configuration
│   └── seed.ts        # Database seeding script
├── copy-assets.js     # Script to copy widget assets for Lambda
└── package.json
```

## Architecture

- **Lambda Function**: Runs the AuthHero Hono application
- **DynamoDB**: Single-table design for all AuthHero data
- **API Gateway**: HTTP API with custom domain support
- **S3 Bucket**: Serves widget assets (CSS, JS)

## Environment Variables

Set these in SST or AWS Systems Manager:

| Variable | Description |
|----------|-------------|
| `TABLE_NAME` | DynamoDB table name (auto-set by SST) |
| `WIDGET_URL` | URL to widget assets (auto-set by SST) |

## Widget Assets

Widget assets are served from an S3 bucket with CloudFront. SST automatically:
1. Copies assets from `node_modules/authhero/dist/assets`
2. Uploads them to S3
3. Creates a CloudFront distribution
4. Sets the `WIDGET_URL` environment variable

## Custom Domain

To use a custom domain, update `sst.config.ts`:

```typescript
const api = new sst.aws.ApiGatewayV2("AuthHeroApi", {
  domain: "auth.yourdomain.com",
});
```

## Production Deployment

```bash
npm run deploy -- --stage production
```

## Costs

Estimated monthly costs for moderate usage:

| Service | Free Tier | After Free Tier |
|---------|-----------|-----------------|
| Lambda | 1M requests/month | $0.20/1M requests |
| DynamoDB | 25 WCU/RCU | ~$0.25/1M requests |
| API Gateway | 1M requests/month | $1.00/1M requests |
| S3 + CloudFront | 1GB + 50GB | ~$5/month |

## Troubleshooting

### Lambda timeout

Increase timeout in `sst.config.ts`:

```typescript
new sst.aws.Function("AuthHero", {
  timeout: "30 seconds",
});
```

### DynamoDB throttling

Enable auto-scaling or increase provisioned capacity in `sst.config.ts`.

### Widget not loading

Ensure the S3 bucket and CloudFront are properly configured. Check browser console for CORS errors.

## Learn More

- [SST Documentation](https://sst.dev/docs)
- [AuthHero Documentation](https://authhero.net/docs)
- [AWS Lambda](https://docs.aws.amazon.com/lambda/)
- [DynamoDB](https://docs.aws.amazon.com/dynamodb/)
