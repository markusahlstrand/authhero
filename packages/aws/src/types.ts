import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export interface DynamoDBConfig {
  tableName: string;
}

export interface DynamoDBContext {
  client: DynamoDBDocumentClient;
  tableName: string;
}

/**
 * Entity types for single-table design
 */
export type EntityType =
  | "FLOW"
  | "TENANT"
  | "USER"
  | "SESSION"
  | "LOGIN_SESSION"
  | "CLIENT"
  | "CLIENT_GRANT"
  | "CONNECTION"
  | "CODE"
  | "PASSWORD"
  | "BRANDING"
  | "THEME"
  | "HOOK"
  | "KEY"
  | "CUSTOM_DOMAIN"
  | "LOG"
  | "EMAIL_PROVIDER"
  | "PROMPT_SETTING"
  | "REFRESH_TOKEN"
  | "FORM"
  | "RESOURCE_SERVER"
  | "ROLE"
  | "ROLE_PERMISSION"
  | "USER_PERMISSION"
  | "USER_ROLE"
  | "ORGANIZATION"
  | "USER_ORGANIZATION"
  | "INVITE"
  | "LEGACY_CLIENT"
  | "CLIENT_CONNECTION"
  | "UNIVERSAL_LOGIN_TEMPLATE"
  | "CUSTOM_TEXT";

/**
 * Base DynamoDB item structure for single-table design
 */
export interface DynamoDBBaseItem {
  PK: string;
  SK: string;
  entityType: EntityType;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
  created_at: string;
  updated_at: string;
  // TTL for automatic expiration (Unix timestamp in seconds)
  ttl?: number;
}
