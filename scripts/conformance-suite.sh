#!/bin/bash

# OpenID Conformance Suite Setup Script for AuthHero
# This script helps set up the OpenID Foundation Conformance Suite
# to test against your local AuthHero instance.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFORMANCE_DIR="${CONFORMANCE_DIR:-$HOME/conformance-suite}"
AUTHHERO_URL="${AUTHHERO_URL:-http://host.docker.internal:3000}"

echo "🔐 OpenID Conformance Suite Setup for AuthHero"
echo "=============================================="
echo ""

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker is not installed. Please install Docker Desktop."
        exit 1
    fi
    
    if ! command -v git &> /dev/null; then
        echo "❌ Git is not installed. Please install Git."
        exit 1
    fi
    
    echo "✅ Prerequisites met"
    echo ""
}

# Clone conformance suite
clone_conformance_suite() {
    if [ -d "$CONFORMANCE_DIR" ]; then
        echo "📁 Conformance suite already exists at $CONFORMANCE_DIR"
        read -p "Do you want to pull the latest changes? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cd "$CONFORMANCE_DIR"
            git pull origin master
        fi
    else
        echo "📥 Cloning conformance suite to $CONFORMANCE_DIR..."
        git clone https://gitlab.com/openid/conformance-suite.git "$CONFORMANCE_DIR"
    fi
    echo ""
}

# Build conformance suite
build_conformance_suite() {
    cd "$CONFORMANCE_DIR"
    
    echo "🔨 Building conformance suite..."
    
    # Check if Java is available
    if command -v java &> /dev/null && java -version 2>&1 | grep -q "version \"17\|version \"18\|version \"19\|version \"20\|version \"21"; then
        echo "Using local Java to build..."
        mvn clean package -DskipTests
    else
        echo "Using Docker to build (this may take a while on first run)..."
        MAVEN_CACHE=./m2 docker-compose -f builder-compose.yml run builder
    fi
    
    echo "✅ Build complete"
    echo ""
}

# Generate AuthHero test configuration
generate_config() {
    echo "📝 Generating test configuration..."
    
    CONFIG_FILE="$SCRIPT_DIR/conformance-config.json"
    
    cat > "$CONFIG_FILE" << EOF
{
  "alias": "authhero-local",
  "description": "AuthHero Local Development Test",
  "server": {
    "discoveryUrl": "${AUTHHERO_URL}/.well-known/openid-configuration"
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
    "resourceUrl": "${AUTHHERO_URL}/userinfo"
  }
}
EOF
    
    echo "✅ Configuration saved to: $CONFIG_FILE"
    echo ""
    cat "$CONFIG_FILE"
    echo ""
}

# Start conformance suite
start_conformance_suite() {
    cd "$CONFORMANCE_DIR"
    
    echo "🚀 Starting conformance suite..."
    
    # Detect OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        COMPOSE_FILE="docker-compose-dev-mac.yml"
    else
        COMPOSE_FILE="docker-compose-dev.yml"
    fi
    
    echo "Using compose file: $COMPOSE_FILE"
    docker-compose -f "$COMPOSE_FILE" up -d
    
    echo ""
    echo "✅ Conformance suite started!"
    echo ""
    echo "📍 Access the conformance suite at: https://localhost:8443/"
    echo ""
    echo "⚠️  You may see a certificate warning. In Chrome, type 'thisisunsafe' to bypass."
    echo ""
}

# Stop conformance suite
stop_conformance_suite() {
    cd "$CONFORMANCE_DIR"
    
    echo "🛑 Stopping conformance suite..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        COMPOSE_FILE="docker-compose-dev-mac.yml"
    else
        COMPOSE_FILE="docker-compose-dev.yml"
    fi
    
    docker-compose -f "$COMPOSE_FILE" down
    
    echo "✅ Conformance suite stopped"
}

# Print setup instructions
print_instructions() {
    echo ""
    echo "========================================"
    echo "🎯 Next Steps"
    echo "========================================"
    echo ""
    echo "1. Make sure AuthHero is running:"
    echo "   cd $SCRIPT_DIR && pnpm demo dev"
    echo ""
    echo "2. Create the conformance test clients in AuthHero."
    echo "   Add this to apps/demo/src/bun.ts or run via API:"
    echo ""
    echo "   await dataAdapter.clients.create('main', {"
    echo "     client_id: 'conformance-test',"
    echo "     client_secret: 'conformanceTestSecret123',"
    echo "     name: 'Conformance Test Client',"
    echo "     callbacks: ["
    echo "       'https://localhost.emobix.co.uk:8443/test/a/authhero-local/callback',"
    echo "       'https://localhost:8443/test/a/authhero-local/callback'"
    echo "     ],"
    echo "     allowed_logout_urls: ['https://localhost:8443/'],"
    echo "     web_origins: ['https://localhost:8443', 'https://localhost.emobix.co.uk:8443'],"
    echo "   });"
    echo ""
    echo "3. Visit: https://localhost:8443/"
    echo ""
    echo "4. Select 'OIDCC: OpenID Provider Certification' test plan"
    echo ""
    echo "5. Switch to 'JSON' tab and paste the config from:"
    echo "   $SCRIPT_DIR/conformance-config.json"
    echo ""
    echo "6. Click 'Start Test Plan' and run individual tests"
    echo ""
}

# Main
case "${1:-setup}" in
    setup)
        check_prerequisites
        clone_conformance_suite
        build_conformance_suite
        generate_config
        print_instructions
        ;;
    start)
        start_conformance_suite
        ;;
    stop)
        stop_conformance_suite
        ;;
    config)
        generate_config
        ;;
    help|--help|-h)
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  setup   - Full setup (clone, build, configure)"
        echo "  start   - Start the conformance suite"
        echo "  stop    - Stop the conformance suite"
        echo "  config  - Regenerate the configuration file"
        echo "  help    - Show this help message"
        echo ""
        echo "Environment variables:"
        echo "  CONFORMANCE_DIR  - Directory for conformance suite (default: ~/conformance-suite)"
        echo "  AUTHHERO_URL     - AuthHero base URL (default: http://host.docker.internal:3000)"
        ;;
    *)
        echo "Unknown command: $1"
        echo "Run '$0 help' for usage"
        exit 1
        ;;
esac
