# Local Development

Deploy AuthHero locally for development or on VPS/dedicated servers for production.

## Node.js

The most common setup for local development and traditional server deployments.

### Requirements

- Node.js 18+ or 20+
- A data adapter (Kysely, Drizzle, or custom)

### Setup

```typescript
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { initMultiTenant } from "@authhero/multi-tenancy";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { app } = initMultiTenant({
  dataAdapter,
  // Widget asset handler for Node.js
  widgetHandler: serveStatic({
    root: path.resolve(__dirname, "../node_modules/authhero/dist/assets/u/widget"),
    rewriteRequestPath: (p) => p.replace("/u/widget", ""),
  }),
});

serve({ fetch: app.fetch, port: 3000 });
```

### Recommended Adapters

- `@authhero/kysely` - Best for PostgreSQL, MySQL, or SQLite
- `@authhero/drizzle` - Alternative ORM with excellent type safety

### Production Deployment

For production on VPS or dedicated servers:

1. **Use a process manager** (PM2, systemd)
   ```bash
   # PM2
   pm2 start dist/index.js --name authhero
   pm2 save
   pm2 startup
   ```

2. **Set up reverse proxy** (nginx, Caddy)
   ```nginx
   # nginx
   server {
     listen 80;
     server_name auth.example.com;
     
     location / {
       proxy_pass http://localhost:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
     }
   }
   ```

3. **Configure SSL** (Let's Encrypt)
   ```bash
   certbot --nginx -d auth.example.com
   ```

## Bun

Fast JavaScript runtime with built-in TypeScript support.

### Requirements

- Bun 1.0+
- A data adapter

### Setup

```typescript
import { serveStatic } from "hono/bun";
import { initMultiTenant } from "@authhero/multi-tenancy";

const { app } = initMultiTenant({
  dataAdapter,
  // Widget asset handler for Bun
  widgetHandler: serveStatic({
    root: "./node_modules/authhero/dist/assets/u/widget",
    rewriteRequestPath: (p) => p.replace("/u/widget", ""),
  }),
});

export default { 
  fetch: app.fetch, 
  port: 3000 
};
```

### Running

```bash
bun run src/index.ts
```

### Recommended Adapters

- `@authhero/kysely` - Works with Bun's built-in SQLite support

## Deno

Secure TypeScript runtime with modern APIs.

### Requirements

- Deno 1.30+
- A data adapter

### Setup

```typescript
import { serveStatic } from "hono/deno";
import { initMultiTenant } from "@authhero/multi-tenancy";

const { app } = initMultiTenant({
  dataAdapter,
  widgetHandler: serveStatic({
    root: "./node_modules/authhero/dist/assets/u/widget",
    rewriteRequestPath: (p) => p.replace("/u/widget", ""),
  }),
});

Deno.serve({ port: 3000 }, app.fetch);
```

### Running

```bash
deno run --allow-net --allow-read src/index.ts
```

## Docker

Containerize AuthHero for consistent deployments.

### Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Widget assets are in node_modules - no copy needed
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  authhero:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/authhero
    depends_on:
      - db
  
  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=authhero
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Running

```bash
docker-compose up -d
```

## Environment Variables

Common environment variables for local deployments:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/authhero

# Server
PORT=3000
NODE_ENV=production

# Optional
LOG_LEVEL=info
ALLOWED_ORIGINS=https://app.example.com
```

## Development Workflow

1. **Install dependencies**
   ```bash
   npm install
   # or
   pnpm install
   # or
   bun install
   ```

2. **Run database migrations**
   ```bash
   npm run migrate
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Access the application**
   - AuthHero API: http://localhost:3000
   - Widget test page: http://localhost:3000/demo

## Troubleshooting

### Widget files not loading

Ensure the `widgetHandler` path is correct:

```typescript
// Use absolute path for Node.js
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

widgetHandler: serveStatic({
  root: path.resolve(__dirname, "../node_modules/authhero/dist/assets/u/widget"),
  rewriteRequestPath: (p) => p.replace("/u/widget", ""),
})
```

### Port already in use

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Database connection errors

Check your connection string and ensure the database is running:

```bash
# PostgreSQL
psql $DATABASE_URL -c "SELECT 1;"

# MySQL
mysql -h localhost -u user -p -e "SELECT 1;"
```

## Next Steps

- [Configure widget assets](./widget-assets)
- [Set up database adapters](../../adapters/)
- [Deploy to production](./multi-cloud)
