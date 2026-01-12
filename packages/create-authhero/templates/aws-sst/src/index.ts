import { handle } from "hono/aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import createAdapters from "@authhero/aws";
import createApp from "./app";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";

// Validate required environment variables
if (!process.env.TABLE_NAME) {
  throw new Error("TABLE_NAME environment variable is required");
}

// Initialize DynamoDB client outside handler for connection reuse
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// Create adapters - reused across invocations
const dataAdapter = createAdapters(docClient, {
  tableName: process.env.TABLE_NAME,
});

export async function handler(event: APIGatewayProxyEventV2, context: Context) {
  // Compute issuer from the request
  const host = event.headers.host || event.requestContext.domainName;
  const protocol = event.headers["x-forwarded-proto"] || "https";
  const issuer = `${protocol}://${host}/`;

  // Get origin for CORS
  const origin = event.headers.origin || "";

  // Widget URL from environment (set by SST)
  const widgetUrl = process.env.WIDGET_URL || "";

  // CORS configuration
  // SECURITY: Configure ALLOWED_ORIGINS environment variable in production
  // to restrict origins. Comma-separated list of allowed origins.
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : [
        // WARNING: These localhost origins are for development only
        // Remove or override via ALLOWED_ORIGINS env var in production
        "http://localhost:5173",
        "https://localhost:3000",
        origin,
      ].filter(Boolean);

  // Create app instance per request to avoid issuer contamination
  // Lambda containers are reused, so we can't mutate process.env.ISSUER globally
  const appWithIssuer = createApp({
    dataAdapter,
    allowedOrigins,
    widgetUrl,
  });

  // Set issuer in a request-scoped way via middleware
  appWithIssuer.use("*", async (c, next) => {
    // Store issuer in context for this request
    const originalIssuer = process.env.ISSUER;
    process.env.ISSUER = issuer;
    try {
      await next();
    } finally {
      // Restore original value to prevent contamination
      if (originalIssuer !== undefined) {
        process.env.ISSUER = originalIssuer;
      } else {
        delete process.env.ISSUER;
      }
    }
  });

  return handle(appWithIssuer)(event, context);
}
