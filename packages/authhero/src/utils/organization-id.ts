import { generateOrganizationId, parseEntityId } from "./entity-id";

export function organizationIdGenerate() {
  return generateOrganizationId();
}

export function organizationIdParse(organizationId: string) {
  return parseEntityId(organizationId, "organization");
}
