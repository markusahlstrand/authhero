import { customAlphabet } from "nanoid";

const ID_LENGTH = 17; // Max length to fit in 21 char DB field with 4-char prefixes

export type EntityType =
  | "organization"
  | "connection"
  | "action"
  | "hook"
  | "rule"
  | "resource_server"
  | "guardian_factor"
  | "invite";

const ENTITY_PREFIXES: Record<EntityType, string> = {
  organization: "org_",
  connection: "con_",
  action: "act_",
  hook: "h_",
  rule: "rul_",
  resource_server: "api_",
  guardian_factor: "gfa_",
  invite: "inv_",
};

export function generateEntityId(entityType: EntityType): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const generateId = customAlphabet(alphabet, ID_LENGTH);

  const id = generateId();
  const prefix = ENTITY_PREFIXES[entityType];

  return `${prefix}${id}`;
}

export function parseEntityId(
  entityId: string,
  entityType: EntityType,
): string {
  const prefix = ENTITY_PREFIXES[entityType];

  if (!entityId.startsWith(prefix)) {
    console.error(
      `Invalid ${entityType} ID format: expected prefix '${prefix}'`,
    );
    return entityId;
  }

  return entityId.substring(prefix.length);
}

// Convenience functions for specific entity types
export function generateOrganizationId(): string {
  return generateEntityId("organization");
}

export function generateConnectionId(): string {
  return generateEntityId("connection");
}

export function generateActionId(): string {
  return generateEntityId("action");
}

export function generateHookId(): string {
  return generateEntityId("hook");
}

export function generateRuleId(): string {
  return generateEntityId("rule");
}

export function generateResourceServerId(): string {
  return generateEntityId("resource_server");
}

export function generateGuardianFactorId(): string {
  return generateEntityId("guardian_factor");
}

export function generateInviteId(): string {
  return generateEntityId("invite");
}

// Generic function to determine entity type from ID
export function getEntityTypeFromId(entityId: string): EntityType | null {
  for (const [entityType, prefix] of Object.entries(ENTITY_PREFIXES)) {
    if (entityId.startsWith(prefix)) {
      return entityType as EntityType;
    }
  }
  return null;
}
