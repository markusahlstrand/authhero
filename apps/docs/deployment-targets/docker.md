---
title: Docker
description: Deploy AuthHero as a Docker container with SQLite
---

# Docker

Run AuthHero as a self-contained Docker container with SQLite. This is the simplest way to deploy AuthHero in production without managing external database dependencies.

## Quick Start

The AuthHero repository includes a `Dockerfile` and `docker-compose.yml` ready to use:

```bash
git clone https://github.com/markusahlstrand/authhero.git
cd authhero
docker compose up --build
```

The server will be available at `http://localhost:3000` with:

- Default admin credentials: `admin` / `admin`
- API documentation at `http://localhost:3000/docs`
- SQLite database persisted in a Docker volume

## Configuration

All configuration is done through environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Server port |
| `ISSUER` | `http://localhost:3000/` | Token issuer URL (must match your public URL) |
| `DATABASE_PATH` | `/data/db.sqlite` | SQLite file location inside the container |
| `SEED` | `true` | Auto-seed database with admin user and default client on startup |
| `ADMIN_USERNAME` | `admin` | Admin username (used during seed) |
| `ADMIN_PASSWORD` | `admin` | Admin password (used during seed) |
| `HTTPS_ENABLED` | `false` | Enable HTTPS with auto-generated self-signed certificates |
| `ALLOWED_ORIGINS` | _(defaults to authhero.net + localhost)_ | Comma-separated CORS origins |

## docker-compose.yml

```yaml
services:
  authhero:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - authhero-data:/data
    environment:
      PORT: 3000
      ISSUER: http://localhost:3000/
      DATABASE_PATH: /data/db.sqlite
      SEED: "true"
      ADMIN_USERNAME: admin
      ADMIN_PASSWORD: admin

volumes:
  authhero-data:
```

## Production Deployment

For production use, update the configuration:

```yaml
services:
  authhero:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - authhero-data:/data
    environment:
      ISSUER: https://auth.example.com/
      SEED: "true"
      ADMIN_USERNAME: admin
      ADMIN_PASSWORD: "${ADMIN_PASSWORD}"
      ALLOWED_ORIGINS: "https://app.example.com,https://admin.example.com"
    restart: unless-stopped

volumes:
  authhero-data:
```

::: warning
Change `ADMIN_PASSWORD` from the default before deploying to production. Use an environment variable or Docker secret.
:::

### Reverse Proxy

In production, place a reverse proxy in front of AuthHero for TLS termination. Here's an example with Caddy:

```yaml
services:
  authhero:
    build: .
    volumes:
      - authhero-data:/data
    environment:
      ISSUER: https://auth.example.com/
      SEED: "true"
      ADMIN_PASSWORD: "${ADMIN_PASSWORD}"
    restart: unless-stopped

  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
    restart: unless-stopped

volumes:
  authhero-data:
  caddy-data:
```

With a `Caddyfile`:

```text
auth.example.com {
    reverse_proxy authhero:3000
}
```

## What Happens on Startup

The Docker entrypoint automatically:

1. **Runs database migrations** — applies any pending schema migrations to SQLite
2. **Seeds the database** (when `SEED=true`) — creates the control plane tenant, admin user, default client, signing keys, and management API resource server. Seeding is idempotent and skips any resources that already exist.
3. **Starts the HTTP server** — listens on the configured port

## Data Persistence

SQLite data is stored at `DATABASE_PATH` (default `/data/db.sqlite`). Use a Docker volume or bind mount to persist data across container restarts:

```bash
# Named volume (recommended)
docker run -v authhero-data:/data authhero

# Bind mount to host directory
docker run -v ./data:/data authhero
```

## Building the Image

```bash
# Build
docker build -t authhero .

# Run
docker run -p 3000:3000 -v authhero-data:/data authhero

# Run with custom config
docker run -p 3000:3000 \
  -v authhero-data:/data \
  -e ISSUER=https://auth.example.com/ \
  -e ADMIN_PASSWORD=my-secure-password \
  authhero
```

## Next Steps

- [Configure widget assets](./widget-assets)
- [Set up the React Admin UI](/apps/react-admin/)
- [Security best practices](/security-model)
