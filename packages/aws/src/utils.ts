import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBContext, DynamoDBBaseItem } from "./types";
import { ListParams } from "@authhero/adapter-interfaces";

/**
 * Generic get operation for DynamoDB
 */
export async function getItem<T>(
  ctx: DynamoDBContext,
  pk: string,
  sk: string,
): Promise<T | null> {
  const result = await ctx.client.send(
    new GetCommand({
      TableName: ctx.tableName,
      Key: { PK: pk, SK: sk },
    }),
  );

  return (result.Item as T) || null;
}

/**
 * Generic put operation for DynamoDB
 * @param dynamoItem - The DynamoDB item with PK, SK, etc.
 */
export async function putItem(
  ctx: DynamoDBContext,
  dynamoItem: DynamoDBBaseItem,
): Promise<void> {
  await ctx.client.send(
    new PutCommand({
      TableName: ctx.tableName,
      Item: dynamoItem as unknown as Record<string, unknown>,
    }),
  );
}

/**
 * Generic delete operation for DynamoDB
 */
export async function deleteItem(
  ctx: DynamoDBContext,
  pk: string,
  sk: string,
): Promise<boolean> {
  await ctx.client.send(
    new DeleteCommand({
      TableName: ctx.tableName,
      Key: { PK: pk, SK: sk },
    }),
  );

  return true;
}

/**
 * Generic query operation for DynamoDB
 */
export async function queryItems<T>(
  ctx: DynamoDBContext,
  pk: string,
  options?: {
    skPrefix?: string;
    skValue?: string;
    indexName?: string;
    limit?: number;
    startKey?: Record<string, unknown>;
    scanIndexForward?: boolean;
  },
): Promise<{ items: T[]; lastKey?: Record<string, unknown> }> {
  const {
    skPrefix,
    skValue,
    indexName,
    limit,
    startKey,
    scanIndexForward = true,
  } = options || {};

  let keyConditionExpression = indexName
    ? `${indexName}PK = :pk`
    : "PK = :pk";
  const expressionAttributeValues: Record<string, unknown> = {
    ":pk": pk,
  };

  if (skPrefix) {
    const skAttr = indexName ? `${indexName}SK` : "SK";
    keyConditionExpression += ` AND begins_with(${skAttr}, :skPrefix)`;
    expressionAttributeValues[":skPrefix"] = skPrefix;
  } else if (skValue) {
    const skAttr = indexName ? `${indexName}SK` : "SK";
    keyConditionExpression += ` AND ${skAttr} = :sk`;
    expressionAttributeValues[":sk"] = skValue;
  }

  const result = await ctx.client.send(
    new QueryCommand({
      TableName: ctx.tableName,
      IndexName: indexName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      Limit: limit,
      ExclusiveStartKey: startKey,
      ScanIndexForward: scanIndexForward,
    }),
  );

  return {
    items: (result.Items as T[]) || [],
    lastKey: result.LastEvaluatedKey,
  };
}

/**
 * Query with pagination support
 */
export async function queryWithPagination<T>(
  ctx: DynamoDBContext,
  pk: string,
  params: ListParams = {},
  options?: {
    skPrefix?: string;
    indexName?: string;
    scanIndexForward?: boolean;
  },
): Promise<{ items: T[]; start: number; limit: number; length: number }> {
  const { page = 0, per_page = 50, include_totals = false } = params;
  const { skPrefix, indexName, scanIndexForward = true } = options || {};

  // For pagination, we need to skip items
  const skip = page * per_page;

  let keyConditionExpression = indexName
    ? `${indexName}PK = :pk`
    : "PK = :pk";
  const expressionAttributeValues: Record<string, unknown> = {
    ":pk": pk,
  };

  if (skPrefix) {
    const skAttr = indexName ? `${indexName}SK` : "SK";
    keyConditionExpression += ` AND begins_with(${skAttr}, :skPrefix)`;
    expressionAttributeValues[":skPrefix"] = skPrefix;
  }

  // If we need to skip items, we need to query more and filter
  // This is a limitation of DynamoDB - no native offset support
  let allItems: T[] = [];
  let lastKey: Record<string, unknown> | undefined;
  let totalFetched = 0;

  // Fetch items until we have enough for the requested page
  const targetCount = skip + per_page;

  while (totalFetched < targetCount) {
    const result = await ctx.client.send(
      new QueryCommand({
        TableName: ctx.tableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: Math.min(targetCount - totalFetched, 1000),
        ExclusiveStartKey: lastKey,
        ScanIndexForward: scanIndexForward,
      }),
    );

    const items = (result.Items as T[]) || [];
    allItems = allItems.concat(items);
    totalFetched += items.length;
    lastKey = result.LastEvaluatedKey;

    if (!lastKey) break;
  }

  // Slice to get the requested page
  const pageItems = allItems.slice(skip, skip + per_page);

  // Get total count if requested
  let totalCount = allItems.length;
  if (include_totals && lastKey) {
    // Count remaining items
    let countLastKey: Record<string, unknown> | undefined = lastKey;
    while (countLastKey) {
      const countResult = await ctx.client.send(
        new QueryCommand({
          TableName: ctx.tableName,
          IndexName: indexName,
          KeyConditionExpression: keyConditionExpression,
          ExpressionAttributeValues: expressionAttributeValues,
          Select: "COUNT",
          ExclusiveStartKey: countLastKey,
        }),
      );
      totalCount += countResult.Count || 0;
      countLastKey = countResult.LastEvaluatedKey;
    }
  }

  return {
    items: pageItems,
    start: skip,
    limit: per_page,
    length: include_totals ? totalCount : pageItems.length,
  };
}

/**
 * Generic update operation for DynamoDB
 */
export async function updateItem(
  ctx: DynamoDBContext,
  pk: string,
  sk: string,
  updates: Record<string, unknown>,
): Promise<boolean> {
  // Filter out undefined values and build update expression
  const filteredUpdates = Object.entries(updates).filter(
    ([, value]) => value !== undefined,
  );

  if (filteredUpdates.length === 0) {
    return true;
  }

  const updateExpression =
    "SET " +
    filteredUpdates.map(([_key], index) => `#attr${index} = :val${index}`).join(", ");

  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

  filteredUpdates.forEach(([key, value], index) => {
    expressionAttributeNames[`#attr${index}`] = key;
    expressionAttributeValues[`:val${index}`] = value;
  });

  await ctx.client.send(
    new UpdateCommand({
      TableName: ctx.tableName,
      Key: { PK: pk, SK: sk },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    }),
  );

  return true;
}

/**
 * Remove DynamoDB metadata fields from an item
 */
export function stripDynamoDBFields<T>(
  item: T,
): Omit<T, "PK" | "SK" | "GSI1PK" | "GSI1SK" | "GSI2PK" | "GSI2SK" | "entityType" | "ttl"> {
  const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entityType, ttl, ...rest } =
    item as any;
  return rest as Omit<
    T,
    "PK" | "SK" | "GSI1PK" | "GSI1SK" | "GSI2PK" | "GSI2SK" | "entityType" | "ttl"
  >;
}

/**
 * Remove null/undefined properties from an object
 */
export function removeNullProperties<T>(obj: T): T {
  const result = { ...obj } as any;
  for (const key in result) {
    if (result[key] === null || result[key] === undefined) {
      delete result[key];
    }
  }
  return result as T;
}
