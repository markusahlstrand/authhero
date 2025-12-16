import dynalite from "dynalite";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import createAdapters from "../../src";
import { DataAdapters } from "@authhero/adapter-interfaces";

const TABLE_NAME = "authhero-test";

interface TestServer {
  server: ReturnType<typeof dynalite>;
  client: DynamoDBClient;
  docClient: DynamoDBDocumentClient;
  port: number;
}

let currentServer: TestServer | null = null;

export async function getTestServer(): Promise<{
  data: DataAdapters;
  client: DynamoDBDocumentClient;
  tableName: string;
}> {
  // Reuse existing server if available
  if (currentServer) {
    const data = createAdapters(currentServer.docClient, { tableName: TABLE_NAME });
    return { data, client: currentServer.docClient, tableName: TABLE_NAME };
  }

  // Generate random port to avoid conflicts in parallel tests
  const port = 4567 + Math.floor(Math.random() * 10000);

  const server = dynalite({ createTableMs: 0 });

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, () => resolve());
  });

  const client = new DynamoDBClient({
    endpoint: `http://localhost:${port}`,
    region: "local",
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  });

  const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });

  // Create table with GSIs
  await client.send(
    new CreateTableCommand({
      TableName: TABLE_NAME,
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
        { AttributeName: "GSI1PK", AttributeType: "S" },
        { AttributeName: "GSI1SK", AttributeType: "S" },
        { AttributeName: "GSI2PK", AttributeType: "S" },
        { AttributeName: "GSI2SK", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "GSI1",
          KeySchema: [
            { AttributeName: "GSI1PK", KeyType: "HASH" },
            { AttributeName: "GSI1SK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        },
        {
          IndexName: "GSI2",
          KeySchema: [
            { AttributeName: "GSI2PK", KeyType: "HASH" },
            { AttributeName: "GSI2SK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        },
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5,
      },
    }),
  );

  currentServer = { server, client, docClient, port };

  const data = createAdapters(docClient, { tableName: TABLE_NAME });

  return { data, client: docClient, tableName: TABLE_NAME };
}

export async function teardownTestServer(): Promise<void> {
  if (currentServer) {
    currentServer.client.destroy();
    await new Promise<void>((resolve) => {
      currentServer!.server.close(() => resolve());
    });
    currentServer = null;
  }
}
