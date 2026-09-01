import type { PasswordInsert, UserInsert } from "@authhero/adapter-interfaces";
import {
  isSupportedBcryptHash,
  type UserImportEntry,
} from "../../types/auth0/UserImport";
import { stripProviderPrefix, userIdGenerate } from "../../utils/user-id";

/**
 * Machine-readable per-row failure reasons, surfaced by the Auth0-compatible
 * `GET /api/v2/jobs/{id}/errors` endpoint. Stable strings — clients branch on
 * them, so treat these as API surface.
 */
export const IMPORT_ERROR_CODES = {
  /** The entry did not match the import-file schema. */
  VALIDATION_ERROR: "VALIDATION_ERROR",
  /** A well-formed hash in an algorithm AuthHero cannot verify. */
  UNSUPPORTED_HASH_ALGORITHM: "UNSUPPORTED_HASH_ALGORITHM",
  /** bcrypt, but a variant or encoding that would never verify. */
  UNSUPPORTED_HASH_FORMAT: "UNSUPPORTED_HASH_FORMAT",
  /** The same identity appears earlier in the same file. */
  DUPLICATE_ENTRY: "DUPLICATE_ENTRY",
  /** The user already exists and `upsert` was not enabled. */
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS",
  /** The write itself failed. */
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ImportErrorCode =
  (typeof IMPORT_ERROR_CODES)[keyof typeof IMPORT_ERROR_CODES];

export interface ImportRowError {
  code: ImportErrorCode;
  message: string;
  path?: string;
}

export type MappedPassword = Pick<PasswordInsert, "password" | "algorithm">;

export interface MappedEntry {
  user: Omit<UserInsert, "connection"> & { connection: string };
  password?: MappedPassword;
}

export type MapResult =
  | { ok: true; value: MappedEntry }
  | { ok: false; error: ImportRowError };

/**
 * Fields Auth0 forbids inside `app_metadata` because they collide with
 * top-level user attributes. Silently dropped rather than rejected, matching
 * Auth0's behaviour of ignoring them.
 */
const FORBIDDEN_APP_METADATA_KEYS = new Set([
  "blocked",
  "email",
  "email_verified",
  "identities",
  "user_id",
  "created_at",
  "updated_at",
  "multifactor",
  "multifactor_last_modified",
  "last_ip",
  "last_login",
  "last_password_reset",
  "phone_number",
  "phone_verified",
  "username",
  "clientID",
  "globalClientID",
  "global_client_id",
]);

function stripForbiddenMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const entries = Object.entries(metadata).filter(
    ([key]) => !FORBIDDEN_APP_METADATA_KEYS.has(key),
  );
  return Object.fromEntries(entries);
}

/**
 * Resolve the entry's password into something AuthHero can actually verify.
 *
 * Returns `undefined` when the entry carries no credential at all — a valid
 * case that produces a shell user who signs in via password reset or the
 * upstream `import_mode` fallback.
 *
 * AuthHero verifies with `bcryptjs.compare`, so bcrypt is the only algorithm
 * that can round-trip. Storing anything else would create a user who can
 * never authenticate, so unsupported hashes fail the row instead.
 */
export function mapPassword(
  entry: UserImportEntry,
): { ok: true; value?: MappedPassword } | { ok: false; error: ImportRowError } {
  if (entry.password_hash !== undefined) {
    if (!isSupportedBcryptHash(entry.password_hash)) {
      return {
        ok: false,
        error: {
          code: IMPORT_ERROR_CODES.UNSUPPORTED_HASH_FORMAT,
          message:
            "password_hash must be a bcrypt hash beginning with $2a$, $2b$ or $2y$",
          path: "password_hash",
        },
      };
    }
    return {
      ok: true,
      value: { password: entry.password_hash, algorithm: "bcrypt" },
    };
  }

  const custom = entry.custom_password_hash;
  if (custom === undefined) {
    return { ok: true, value: undefined };
  }

  if (custom.algorithm !== "bcrypt") {
    return {
      ok: false,
      error: {
        code: IMPORT_ERROR_CODES.UNSUPPORTED_HASH_ALGORITHM,
        message: `AuthHero can only import bcrypt password hashes; received "${custom.algorithm}". Users with other algorithms must reset their password on first login.`,
        path: "custom_password_hash.algorithm",
      },
    };
  }

  // Auth0 requires utf8 for bcrypt; any other encoding means the stored
  // string is not the hash bcryptjs would compare against.
  if (custom.hash.encoding !== undefined && custom.hash.encoding !== "utf8") {
    return {
      ok: false,
      error: {
        code: IMPORT_ERROR_CODES.UNSUPPORTED_HASH_FORMAT,
        message: "bcrypt hashes must use utf8 encoding",
        path: "custom_password_hash.hash.encoding",
      },
    };
  }

  if (!isSupportedBcryptHash(custom.hash.value)) {
    return {
      ok: false,
      error: {
        code: IMPORT_ERROR_CODES.UNSUPPORTED_HASH_FORMAT,
        message:
          "bcrypt hash must begin with $2a$, $2b$ or $2y$ ($2$ and $2x$ are not supported)",
        path: "custom_password_hash.hash.value",
      },
    };
  }

  return {
    ok: true,
    value: { password: custom.hash.value, algorithm: "bcrypt" },
  };
}

/**
 * Build the stored `provider|id` identifier for an imported entry.
 *
 * Auth0 prefixes bare import ids with the connection's provider; AuthHero
 * uses the tenant's resolved username-password provider (`auth0`, or `auth2`
 * for tenants still pinned to the legacy value) so the password row lands on
 * the identity the login path actually reads. An entry that already carries
 * the prefix is not double-prefixed, and one with no id at all gets a
 * generated one — the users table requires the column.
 *
 * Mirrors `POST /api/v2/users`, which derives the id exactly this way.
 */
export function buildUserId(
  userId: string | undefined,
  provider: string,
  fallbackId?: string,
): string {
  const idPart = userId
    ? stripProviderPrefix(userId, provider)
    : (fallbackId ?? userIdGenerate());
  return `${provider}|${idPart}`;
}

/**
 * Deterministic bare id for an import row that supplied no `user_id`.
 *
 * Retry safety depends on this. A driver can create a user and then die
 * before committing that row's outcome, leaving the row `pending`; the next
 * driver reprocesses it. With a random id the retry cannot tell its own
 * half-finished write from a genuinely pre-existing user, and reports a
 * successful import as `USER_ALREADY_EXISTS`. Deriving the id from
 * `(operation_id, seq)` — both immutable for the life of the row — makes the
 * retry regenerate the exact same id, so it can recognise its own work.
 *
 * Not a security boundary: the inputs are our own identifiers, so this only
 * needs to be stable and collision-free, which a truncated SHA-256 is.
 */
export async function deriveImportUserId(
  operationId: string,
  seq: number,
): Promise<string> {
  const data = new TextEncoder().encode(`${operationId}:${seq}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface MapEntryParams {
  entry: UserImportEntry;
  /** Connection NAME (the users table stores the name, not the id). */
  connection: string;
  /** Resolved username-password provider for this tenant. */
  provider: string;
  /**
   * Id to use when the entry supplies none. Pass the value from
   * {@link deriveImportUserId} so a reprocessed row rebuilds the same id;
   * omitting it falls back to a random one.
   */
  fallbackUserId?: string;
}

/**
 * Map one validated import entry onto the user and password rows to write.
 * Pure — performs no I/O and makes no existence checks, so it is safe to call
 * repeatedly when a chunk is retried.
 */
export function mapEntry({
  entry,
  connection,
  provider,
  fallbackUserId,
}: MapEntryParams): MapResult {
  const password = mapPassword(entry);
  if (!password.ok) {
    return { ok: false, error: password.error };
  }

  const user: MappedEntry["user"] = {
    email: entry.email,
    email_verified: entry.email_verified ?? false,
    connection,
    provider,
    is_social: false,
  };

  user.user_id = buildUserId(entry.user_id, provider, fallbackUserId);
  if (entry.username !== undefined) user.username = entry.username;
  if (entry.phone_number !== undefined) user.phone_number = entry.phone_number;
  if (entry.phone_verified !== undefined) {
    user.phone_verified = entry.phone_verified;
  }
  user.name = entry.name ?? entry.email;
  if (entry.given_name !== undefined) user.given_name = entry.given_name;
  if (entry.family_name !== undefined) user.family_name = entry.family_name;
  if (entry.nickname !== undefined) user.nickname = entry.nickname;
  if (entry.picture !== undefined) user.picture = entry.picture;

  const appMetadata = stripForbiddenMetadata(entry.app_metadata);
  if (appMetadata !== undefined) user.app_metadata = appMetadata;
  if (entry.user_metadata !== undefined) {
    user.user_metadata = entry.user_metadata;
  }

  return {
    ok: true,
    value: { user, password: password.value },
  };
}

/**
 * Strip credential material from a staged entry before it is returned by
 * `GET /jobs/{id}/errors`.
 *
 * Redaction happens on the way OUT, not on the way in: the staged row is the
 * work item, so it must keep the hash the job exists to import. What must
 * never happen is echoing that hash back over the API, which is what this
 * guards. The marker is left in place so an operator reading an error can
 * still tell a credential was supplied.
 */
export function redactEntry(entry: unknown): Record<string, unknown> {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return { value: entry };
  }

  const source: Record<string, unknown> = { ...entry };
  if ("password_hash" in source) {
    source.password_hash = "[redacted]";
  }
  if (
    "custom_password_hash" in source &&
    typeof source.custom_password_hash === "object" &&
    source.custom_password_hash !== null
  ) {
    const custom: Record<string, unknown> = {
      ...source.custom_password_hash,
    };
    if ("hash" in custom) custom.hash = "[redacted]";
    if ("salt" in custom) custom.salt = "[redacted]";
    source.custom_password_hash = custom;
  }
  return source;
}

/**
 * Normalize a raw file entry into the record shape a staged row stores,
 * WITHOUT redacting: the row has to carry the credential it is going to
 * import. {@link redactEntry} is applied when the row is read back out.
 */
export function toStagedPayload(entry: unknown): Record<string, unknown> {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return { value: entry };
  }
  return { ...entry };
}

/**
 * Identity keys Auth0 dedupes an import file on: a repeat of any of these
 * within one file is an error rather than a silent overwrite.
 */
export function entryIdentityKeys(entry: UserImportEntry): string[] {
  const keys: string[] = [`email:${entry.email.toLowerCase()}`];
  if (entry.user_id !== undefined) keys.push(`user_id:${entry.user_id}`);
  if (entry.username !== undefined) {
    keys.push(`username:${entry.username.toLowerCase()}`);
  }
  if (entry.phone_number !== undefined) {
    keys.push(`phone:${entry.phone_number}`);
  }
  return keys;
}
