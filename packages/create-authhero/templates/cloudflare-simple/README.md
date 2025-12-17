# AuthHero Cloudflare Simple Server

A single-tenant AuthHero authentication server using Cloudflare Workers and D1.

## Prerequisites

- [Cloudflare Account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a D1 database:

   ```bash
   wrangler d1 create authhero-db
   ```

3. Update `wrangler.toml` with your database ID from the output above.

4. Run local database migrations:

   ```bash
   npm run db:migrate
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

## Deployment

1. Deploy to Cloudflare:

   ```bash
   npm run deploy
   ```

2. Run production migrations:
   ```bash
   npm run db:migrate:prod
   ```

## Project Structure

```
├── src/
│   ├── index.ts    # Worker entry point
│   ├── app.ts      # AuthHero app configuration
│   └── types.ts    # TypeScript type definitions
├── wrangler.toml   # Cloudflare Worker configuration
└── package.json
```

## API Documentation

Visit your worker URL with `/docs` to see the Swagger UI documentation.

## Custom Domain

To add a custom domain, update `wrangler.toml`:

```toml
routes = [
  { pattern = "auth.yourdomain.com", custom_domain = true }
]
```

For more information, visit [https://authhero.net/docs](https://authhero.net/docs).
