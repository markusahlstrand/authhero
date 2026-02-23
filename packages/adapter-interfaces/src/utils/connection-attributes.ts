import type { Connection, ConnectionInsert } from "../types/Connection";

type ConnectionLike = Connection | ConnectionInsert;

interface IdentifierConfig {
  /** Whether username is accepted as a login identifier */
  usernameIdentifierActive: boolean;
  /** Whether email is accepted as a login identifier */
  emailIdentifierActive: boolean;
  /** Minimum username length (defaults to 1) */
  usernameMinLength: number;
  /** Maximum username length (defaults to 15) */
  usernameMaxLength: number;
}

/**
 * Reads the modern `attributes` schema from a connection's options,
 * with fallback to the legacy `requires_username` / `validation` fields.
 *
 * Auth0 migrated from:
 *   options.requires_username (boolean) + options.validation.username.{min,max}
 * to:
 *   options.attributes.email.identifier.active
 *   options.attributes.username.identifier.active
 *   options.attributes.username.validation.{min_length,max_length}
 */
export function getConnectionIdentifierConfig(
  connection: ConnectionLike | null | undefined,
): IdentifierConfig {
  const options = connection?.options;

  if (!options) {
    return {
      usernameIdentifierActive: false,
      emailIdentifierActive: true,
      usernameMinLength: 1,
      usernameMaxLength: 15,
    };
  }

  const attributes = options.attributes;

  // If modern attributes are set, use them
  if (attributes) {
    const usernameIdentifierActive =
      attributes.username?.identifier?.active === true;

    // Default email to active unless explicitly disabled
    const emailIdentifierActive =
      attributes.email?.identifier?.active !== false;

    const usernameMinLength =
      attributes.username?.validation?.min_length ?? 1;
    const usernameMaxLength =
      attributes.username?.validation?.max_length ?? 15;

    return {
      usernameIdentifierActive,
      emailIdentifierActive,
      usernameMinLength,
      usernameMaxLength,
    };
  }

  // Fallback to legacy requires_username + validation
  const usernameIdentifierActive = options.requires_username === true;

  return {
    usernameIdentifierActive,
    emailIdentifierActive: true,
    usernameMinLength: options.validation?.username?.min ?? 1,
    usernameMaxLength: options.validation?.username?.max ?? 15,
  };
}
