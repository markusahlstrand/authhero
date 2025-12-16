import dynalite from "dynalite";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import createAdapters from "../../src";
import { DataAdapters } from "@authhero/adapter-interfaces";

const TABLE_NAME = "authhero-test";

let server: ReturnType<typeof dynalite> | null = null;
let client: DynamoDBClient | null = null;
let docClient: DynamoDBDocumentClient | null = null;
let port: number;

export async function getTestServer(): Promise<{ data: DataAdapters }> {
  // Generate random port to avoid conflicts in parallel tests
  port = 4567 + Math.floor(Math.random() * 1000);

  server = dynalite({ createTableMs: 0 });

  await new Promise<void>((resolve) => {
    server!.listen(port, () => resolve());
  });

  client = new DynamoDBClient({
    endpoint: `http://localhost:${port}`,
    region: "local",
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  });

  docClient = DynamoDBDocumentClient.from(client, {
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

  const data = createAdapters(docClient, { tableName: TABLE_NAME });

  return { data };
}

export async function teardownTestServer(): Promise<void> {
  if (client) {
    client.destroy();
    client = null;
  }
  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => resolve());
    });
    server = null;
  }
  docClient = null;
}
