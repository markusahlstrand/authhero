import { Client, LegacyClient } from "@authhero/adapter-interfaces";

/**
 * Converts a Client from the new format to LegacyClient format by extracting
 * legacy fields from client_metadata
 */
export function clientToLegacyClient(
  client: Client & { tenant: any; connections: any[] },
): LegacyClient {
  const metadata = client.client_metadata || {};

  return {
    ...client,
    // Extract legacy fields from client_metadata
    disable_sign_ups: metadata.disable_sign_ups === "true",
    email_validation: metadata.email_validation || "disabled",
  } as LegacyClient;
}

/**
 * Extracts disable_sign_ups from client metadata
 */
export function getDisableSignUps(client: Client): boolean {
  const metadata = client.client_metadata || {};
  return metadata.disable_sign_ups === "true";
}

/**
 * Extracts email_validation from client metadata
 */
export function getEmailValidation(client: Client): string {
  const metadata = client.client_metadata || {};
  return metadata.email_validation || "disabled";
}

/**
 * Updates client metadata with legacy field values
 */
export function setLegacyFieldsInMetadata(
  client: Partial<Client>,
  disable_sign_ups?: boolean,
  email_validation?: string,
): Partial<Client> {
  const metadata = { ...(client.client_metadata || {}) };

  if (disable_sign_ups !== undefined) {
    metadata.disable_sign_ups = disable_sign_ups.toString();
  }

  if (email_validation !== undefined) {
    metadata.email_validation = email_validation;
  }

  return {
    ...client,
    client_metadata: metadata,
  };
}
