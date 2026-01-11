import { handle } from "hono/aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import createAdapters from "@authhero/aws";
import createApp from "./app";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";

// Initialize DynamoDB client outside handler for connection reuse
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// Create adapters - reused across invocations
const dataAdapter = createAdapters(docClient, {
  tableName: process.env.TABLE_NAME!,
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

  const app = createApp({
    dataAdapter,
    allowedOrigins: [
      "http://localhost:5173",
      "https://localhost:3000",
      "https://manage.authhero.net",
      "https://local.authhero.net",
      origin,
    ].filter(Boolean),
    widgetUrl,
  });

  // Add issuer to environment for the app
  process.env.ISSUER = issuer;

  return handle(app)(event, context);
}
