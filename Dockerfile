FROM node:23-slim AS base

RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

WORKDIR /app

# Copy package manifests for dependency caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/authhero/package.json packages/authhero/
COPY packages/adapter-interfaces/package.json packages/adapter-interfaces/
COPY packages/kysely/package.json packages/kysely/
COPY packages/multi-tenancy/package.json packages/multi-tenancy/
COPY packages/saml/package.json packages/saml/
COPY packages/cloudflare/package.json packages/cloudflare/
COPY packages/drizzle/package.json packages/drizzle/
COPY packages/aws/package.json packages/aws/
COPY packages/create-authhero/package.json packages/create-authhero/
COPY packages/create-authhero/auth-server/package.json packages/create-authhero/auth-server/
COPY packages/ui-widget/package.json packages/ui-widget/
COPY apps/react-admin/package.json apps/react-admin/
COPY apps/auth0-proxy/package.json apps/auth0-proxy/
COPY apps/docs/package.json apps/docs/
COPY docker/package.json docker/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ packages/
COPY docker/ docker/

# Build packages in dependency order
RUN pnpm --filter @authhero/adapter-interfaces build
RUN pnpm --filter @authhero/kysely-adapter build
RUN pnpm --filter authhero build

# Runtime
VOLUME /data
EXPOSE 3000

ENV PORT=3000
ENV DATABASE_PATH=/data/db.sqlite
ENV SEED=true
ENV ADMIN_USERNAME=admin
ENV ADMIN_PASSWORD=admin

CMD ["pnpm", "--filter", "@authhero/docker", "start"]
