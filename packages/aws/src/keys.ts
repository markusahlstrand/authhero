/**
 * Key generation utilities for single-table DynamoDB design
 */

// Tenant keys
export const tenantKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: () => "TENANT",
  // GSI1 for listing all tenants
  gsi1pk: () => "TENANTS",
  gsi1sk: (tenantId: string) => `TENANT#${tenantId}`,
};

// User keys
export const userKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (userId: string) => `USER#${userId}`,
  // GSI1 for email lookup
  gsi1pk: (tenantId: string, email: string) =>
    `TENANT#${tenantId}#EMAIL#${email.toLowerCase()}`,
  gsi1sk: () => "USER",
  // GSI2 for connection lookup
  gsi2pk: (tenantId: string, connection: string) =>
    `TENANT#${tenantId}#CONNECTION#${connection}`,
  gsi2sk: (userId: string) => `USER#${userId}`,
};

// Session keys
export const sessionKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (sessionId: string) => `SESSION#${sessionId}`,
  // GSI1 for user session lookup
  gsi1pk: (tenantId: string, userId: string) =>
    `TENANT#${tenantId}#USER#${userId}`,
  gsi1sk: (sessionId: string) => `SESSION#${sessionId}`,
};

// Login session keys
export const loginSessionKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (loginSessionId: string) => `LOGIN_SESSION#${loginSessionId}`,
};

// Client keys
export const clientKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (clientId: string) => `CLIENT#${clientId}`,
};

// Client grant keys
export const clientGrantKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (clientGrantId: string) => `CLIENT_GRANT#${clientGrantId}`,
  // GSI1 for client lookup
  gsi1pk: (tenantId: string, clientId: string) =>
    `TENANT#${tenantId}#CLIENT#${clientId}`,
  gsi1sk: (audience: string) => `CLIENT_GRANT#${audience}`,
};

// Connection keys
export const connectionKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (connectionId: string) => `CONNECTION#${connectionId}`,
  // GSI1 for connection name lookup
  gsi1pk: (tenantId: string, connectionName: string) =>
    `TENANT#${tenantId}#CONNECTION_NAME#${connectionName}`,
  gsi1sk: () => "CONNECTION",
};

// Code keys
export const codeKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (codeId: string, codeType: string) => `CODE#${codeId}#${codeType}`,
  // For querying by code_id when code_type is unknown
  skPrefixByCodeId: (codeId: string) => `CODE#${codeId}#`,
};

// Password keys
export const passwordKeys = {
  pk: (tenantId: string, userId: string) => `TENANT#${tenantId}#USER#${userId}`,
  sk: (passwordId: string) => `PASSWORD#${passwordId}`,
  // For listing all passwords for a user
  skPrefix: () => "PASSWORD#",
};

// Branding keys (one per tenant)
export const brandingKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: () => "BRANDING",
};

// Universal login template keys (one per tenant)
export const universalLoginTemplateKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: () => "UNIVERSAL_LOGIN_TEMPLATE",
};

// Theme keys
export const themeKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (themeId: string) => `THEME#${themeId}`,
};

// Hook keys
export const hookKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (hookId: string) => `HOOK#${hookId}`,
};

// Key (signing key) keys - global, not per-tenant
export const keyKeys = {
  pk: () => "KEYS",
  sk: (kid: string) => `KEY#${kid}`,
};

// Custom domain keys
export const customDomainKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (customDomainId: string) => `CUSTOM_DOMAIN#${customDomainId}`,
  // GSI1 for domain lookup (global)
  gsi1pk: (domain: string) => `DOMAIN#${domain}`,
  gsi1sk: () => "CUSTOM_DOMAIN",
};

// Log keys
export const logKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (logId: string) => `LOG#${logId}`,
  // GSI1 for time-based queries
  gsi1pk: (tenantId: string, date: string) => `TENANT#${tenantId}#LOG#${date}`,
  gsi1sk: (logId: string) => `LOG#${logId}`,
};

// Email provider keys (one per tenant)
export const emailProviderKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: () => "EMAIL_PROVIDER",
};

// Prompt settings keys (one per tenant)
export const promptSettingsKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: () => "PROMPT_SETTINGS",
};

// Refresh token keys
export const refreshTokenKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (tokenId: string) => `REFRESH_TOKEN#${tokenId}`,
  // GSI1 for user lookup
  gsi1pk: (tenantId: string, userId: string) =>
    `TENANT#${tenantId}#USER#${userId}`,
  gsi1sk: (tokenId: string) => `REFRESH_TOKEN#${tokenId}`,
};

// Form keys
export const formKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (formId: string) => `FORM#${formId}`,
};

// Flow keys
export const flowKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (flowId: string) => `FLOW#${flowId}`,
};

// Resource server keys
export const resourceServerKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (resourceServerId: string) => `RESOURCE_SERVER#${resourceServerId}`,
  // GSI1 for identifier lookup
  gsi1pk: (tenantId: string, identifier: string) =>
    `TENANT#${tenantId}#RESOURCE_SERVER_ID#${identifier}`,
  gsi1sk: () => "RESOURCE_SERVER",
};

// Role keys
export const roleKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (roleId: string) => `ROLE#${roleId}`,
};

// Role permission keys
export const rolePermissionKeys = {
  pk: (tenantId: string, roleId: string) => `TENANT#${tenantId}#ROLE#${roleId}`,
  sk: (resourceServerIdentifier: string, permissionName: string) =>
    `PERMISSION#${resourceServerIdentifier}#${permissionName}`,
  skPrefix: () => "PERMISSION#",
};

// User permission keys
export const userPermissionKeys = {
  pk: (tenantId: string, userId: string, organizationId?: string) =>
    organizationId
      ? `TENANT#${tenantId}#ORG#${organizationId}#USER#${userId}`
      : `TENANT#${tenantId}#USER#${userId}`,
  sk: (resourceServerIdentifier: string, permissionName: string) =>
    `USER_PERMISSION#${resourceServerIdentifier}#${permissionName}`,
  skPrefix: () => "USER_PERMISSION#",
};

// User role keys
export const userRoleKeys = {
  pk: (tenantId: string, userId: string, organizationId?: string) =>
    organizationId
      ? `TENANT#${tenantId}#ORG#${organizationId}#USER#${userId}`
      : `TENANT#${tenantId}#USER#${userId}`,
  sk: (roleId: string) => `USER_ROLE#${roleId}`,
  skPrefix: () => "USER_ROLE#",
};

// Organization keys
export const organizationKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (organizationId: string) => `ORGANIZATION#${organizationId}`,
  // GSI1 for organization name lookup
  gsi1pk: (tenantId: string, organizationName: string) =>
    `TENANT#${tenantId}#ORG_NAME#${organizationName}`,
  gsi1sk: () => "ORGANIZATION",
};

// User organization keys
export const userOrganizationKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (userOrganizationId: string) => `USER_ORG#${userOrganizationId}`,
  // GSI1 for user lookup
  gsi1pk: (tenantId: string, userId: string) =>
    `TENANT#${tenantId}#USER#${userId}`,
  gsi1sk: (organizationId: string) => `USER_ORG#${organizationId}`,
  // GSI2 for organization lookup
  gsi2pk: (tenantId: string, organizationId: string) =>
    `TENANT#${tenantId}#ORG#${organizationId}`,
  gsi2sk: (userId: string) => `USER_ORG#${userId}`,
};

// Invite keys
export const inviteKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (inviteId: string) => `INVITE#${inviteId}`,
  // GSI1 for organization lookup
  gsi1pk: (tenantId: string, organizationId: string) =>
    `TENANT#${tenantId}#ORG#${organizationId}`,
  gsi1sk: (inviteId: string) => `INVITE#${inviteId}`,
};

// Legacy client keys
export const legacyClientKeys = {
  pk: () => "LEGACY_CLIENTS",
  sk: (clientId: string) => `LEGACY_CLIENT#${clientId}`,
};

// Client connection keys (many-to-many relationship)
export const clientConnectionKeys = {
  pk: (tenantId: string, clientId: string) =>
    `TENANT#${tenantId}#CLIENT#${clientId}`,
  sk: (connectionId: string, order: number) =>
    `CLIENT_CONNECTION#${String(order).padStart(5, "0")}#${connectionId}`,
  skPrefix: () => "CLIENT_CONNECTION#",
  // GSI1 for connection lookup (find all clients using a connection)
  gsi1pk: (tenantId: string, connectionId: string) =>
    `TENANT#${tenantId}#CONNECTION#${connectionId}`,
  gsi1sk: (clientId: string) => `CLIENT_CONNECTION#${clientId}`,
};

// Custom text keys
export const customTextKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (prompt: string, language: string) => `CUSTOM_TEXT#${prompt}#${language}`,
  skPrefix: () => "CUSTOM_TEXT#",
};
