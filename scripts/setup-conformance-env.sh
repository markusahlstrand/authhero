#!/bin/bash

# OpenID Conformance Suite Environment Setup
# Uses create-authhero to scaffold a test environment
# and adds conformance-specific clients

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$HOME/conformance-authhero}"
PORT="${PORT:-3000}"
ALIAS="${ALIAS:-authhero-local}"

echo "🔐 OpenID Conformance Suite Environment Setup"
echo "=============================================="
echo ""
echo "Project directory: $PROJECT_DIR"
echo "Port: $PORT"
echo "Alias: $ALIAS"
echo ""

# Check if create-authhero is available
if ! command -v npx &> /dev/null; then
    echo "❌ npx is not installed. Please install Node.js first."
    exit 1
fi

# Create project directory if needed
if [ -d "$PROJECT_DIR" ]; then
    echo "⚠️  Directory already exists: $PROJECT_DIR"
    read -p "Do you want to remove it and start fresh? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$PROJECT_DIR"
    else
        echo "Exiting..."
        exit 1
    fi
fi

# Create the project using create-authhero
echo "📦 Creating AuthHero project with create-authhero..."
cd "$(dirname "$PROJECT_DIR")"
npx -y create-authhero@latest "$(basename "$PROJECT_DIR")" \
    --template local \
    --email user@conformance-test.local \
    --password password \
    --yes \
    --skip-start

cd "$PROJECT_DIR"

# Create conformance-specific seed script that adds extra clients
echo "📝 Creating conformance client seed script..."
cat > src/seed-conformance.ts << EOF
import { SqliteDialect } from "kysely";
import { Kysely } from "kysely";
import Database from "better-sqlite3";
import createAdapters from "@authhero/kysely-adapter";

const ALIAS = process.env.ALIAS || "authhero-local";

async function main() {
  console.log("🔐 Adding OpenID Conformance Suite clients...");
  console.log("");

  const dialect = new SqliteDialect({
    database: new Database("db.sqlite"),
  });

  const db = new Kysely<any>({ dialect });
  const adapters = createAdapters(db);

  // Callback URLs for conformance suite
  const callbacks = [
    \`https://localhost.emobix.co.uk:8443/test/a/\${ALIAS}/callback\`,
    \`https://localhost:8443/test/a/\${ALIAS}/callback\`,
  ];
  const logoutUrls = [
    "https://localhost:8443/",
    "https://localhost.emobix.co.uk:8443/",
  ];
  const webOrigins = [
    "https://localhost:8443",
    "https://localhost.emobix.co.uk:8443",
  ];

  // Create conformance-test client
  try {
    await adapters.clients.create("main", {
      client_id: "conformance-test",
      client_secret: "conformanceTestSecret123",
      name: "Conformance Test Client",
      callbacks,
      allowed_logout_urls: logoutUrls,
      web_origins: webOrigins,
    });
    console.log("  ✅ Created conformance-test client");
  } catch (e: any) {
    if (e.message?.includes("UNIQUE constraint")) {
      console.log("  ℹ️  conformance-test client already exists");
    } else {
      throw e;
    }
  }

  // Create conformance-test2 client
  try {
    await adapters.clients.create("main", {
      client_id: "conformance-test2",
      client_secret: "conformanceTestSecret456",
      name: "Conformance Test Client 2",
      callbacks,
      allowed_logout_urls: logoutUrls,
      web_origins: webOrigins,
    });
    console.log("  ✅ Created conformance-test2 client");
  } catch (e: any) {
    if (e.message?.includes("UNIQUE constraint")) {
      console.log("  ℹ️  conformance-test2 client already exists");
    } else {
      throw e;
    }
  }

  await db.destroy();

  console.log("");
  console.log("✅ Conformance clients added successfully!");
}

main().catch(console.error);
EOF

# Update package.json to add conformance script
echo "📝 Updating package.json..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts['seed:conformance'] = 'npx tsx src/seed-conformance.ts';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

# Seed with conformance clients
echo "🌱 Adding conformance clients..."
ALIAS="$ALIAS" npx tsx src/seed-conformance.ts

# Generate conformance config
echo "📝 Generating conformance-config.json..."
cat > conformance-config.json << EOF
{
  "alias": "$ALIAS",
  "description": "AuthHero Conformance Test",
  "server": {
    "discoveryUrl": "http://host.docker.internal:$PORT/.well-known/openid-configuration"
  },
  "client": {
    "client_id": "conformance-test",
    "client_secret": "conformanceTestSecret123"
  },
  "client2": {
    "client_id": "conformance-test2",
    "client_secret": "conformanceTestSecret456"
  },
  "resource": {
    "resourceUrl": "http://host.docker.internal:$PORT/userinfo"
  }
}
EOF

echo ""
echo "========================================"
echo "🎉 Setup Complete!"
echo "========================================"
echo ""
echo "Project location: $PROJECT_DIR"
echo ""
echo "Test User:"
echo "  • user@conformance-test.local / password"
echo ""
echo "Clients:"
echo "  • conformance-test / conformanceTestSecret123"
echo "  • conformance-test2 / conformanceTestSecret456"
echo ""
echo "To start the AuthHero server:"
echo "  cd $PROJECT_DIR"
echo "  npm run dev"
echo ""
echo "To start the conformance suite:"
echo "  pnpm conformance:start  (from authhero monorepo)"
echo ""
echo "Configuration file for conformance suite:"
echo "  $PROJECT_DIR/conformance-config.json"
echo ""
echo "Open https://localhost:8443 and paste the config"
echo "from conformance-config.json into the JSON tab."
echo ""
