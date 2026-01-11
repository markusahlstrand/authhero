# Deployment Targets

AuthHero is designed to run on multiple platforms. This guide covers deployment to different environments and their specific requirements.

## Overview

AuthHero can be deployed to:

- **[Local Development](./local)** - Node.js, Bun, or Deno
- **[Cloudflare Workers](./cloudflare)** - Edge computing platform
- **[AWS](./aws)** - Lambda, ECS, or EC2
- **[Multi-Cloud](./multi-cloud)** - Run across multiple providers for resilience

::: tip Coming Soon
Documentation for additional platforms:
- Vercel
- Google Cloud Platform (GCP)
- Docker/Kubernetes
- Azure
- Railway, Render, Fly.io
:::

## Widget Assets

All deployment targets must serve the AuthHero widget assets. Learn more about [widget asset configuration](./widget-assets).

## Quick Comparison

| Platform | Startup Time | Scaling | Cost Model | Best For |
|----------|-------------|---------|------------|----------|
| [Local/Node](./local) | Instant | Manual | Fixed | Development, VPS |
| [Cloudflare](./cloudflare) | ~0ms (warm) | Automatic | Pay-per-use | Global edge |
| [AWS Lambda](./aws#lambda) | 100-500ms | Automatic | Pay-per-use | Serverless |
| [AWS ECS](./aws#ecs) | Instant | Manual/Auto | Fixed | Long-running |

## Choosing a Deployment Target

**Choose Cloudflare Workers if:**
- Global user base with low latency requirements
- Pay-per-use cost model preferred
- Simple deployment desired
- Edge computing benefits needed

**Choose AWS Lambda if:**
- Already on AWS ecosystem
- Need complex AWS service integrations
- Variable traffic patterns
- Serverless architecture preferred

**Choose AWS ECS/Fargate if:**
- Long-running processes required
- Predictable, consistent traffic
- Need full control over environment
- Complex dependencies

**Choose Local/VPS if:**
- Self-hosted requirement
- Existing infrastructure
- Cost predictability important
- Simple deployment preferred

## Database Considerations

Different platforms work best with different databases:

- **Cloudflare Workers** → Cloudflare D1 (SQLite-compatible)
- **AWS Lambda** → RDS PostgreSQL/MySQL, Aurora Serverless
- **AWS ECS** → RDS PostgreSQL/MySQL, Aurora
- **Local/VPS** → PostgreSQL, MySQL, SQLite

See [Adapters](../adapters) for database integration details.

## Next Steps

1. Choose your deployment target from the menu
2. Follow the platform-specific setup guide
3. Configure [widget assets](./widget-assets) for your platform
4. Review [security best practices](../../security-model)
