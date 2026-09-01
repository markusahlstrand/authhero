import { z } from "@hono/zod-openapi";

/**
 * Auth0's bulk user-import file schema (issue #1325).
 *
 * Mirrors the schema documented at
 * https://auth0.com/docs/manage-users/user-migration/bulk-user-import-database-schema-and-examples
 * so a migration script written against Auth0 works against AuthHero by
 * changing only the base URL.
 *
 * Deliberately permissive about *shape* and strict about *credentials*:
 * unknown profile fields are ignored rather than rejected (Auth0 tolerates
 * extra keys), but anything that would become a stored password is
 * validated hard, because a hash we cannot verify is a user who can never
 * log in.
 */

/** bcrypt variants `bcryptjs.compare` can verify. `$2$` / `$2x$` are not. */
const BCRYPT_PREFIXES = ["$2a$", "$2b$", "$2y$"] as const;

export function isSupportedBcryptHash(value: string): boolean {
  return BCRYPT_PREFIXES.some((prefix) => value.startsWith(prefix));
}

/**
 * Every algorithm Auth0 accepts in `custom_password_hash.algorithm`.
 * AuthHero stores only bcrypt today — the rest are parsed so they can be
 * reported as a precise per-row error instead of a whole-file rejection.
 */
export const auth0PasswordHashAlgorithmSchema = z.enum([
  "argon2",
  "bcrypt",
  "hmac",
  "ldap",
  "md4",
  "md5",
  "pbkdf2",
  "scrypt",
  "sha1",
  "sha256",
  "sha512",
]);
export type Auth0PasswordHashAlgorithm = z.infer<
  typeof auth0PasswordHashAlgorithmSchema
>;

const hashEncodingSchema = z.enum(["base64", "hex", "utf8"]);

export const customPasswordHashSchema = z.object({
  algorithm: auth0PasswordHashAlgorithmSchema,
  hash: z.object({
    value: z.string(),
    encoding: hashEncodingSchema.optional(),
    digest: z.string().optional(),
    key: z
      .object({
        value: z.string(),
        encoding: hashEncodingSchema.optional(),
      })
      .optional(),
  }),
  salt: z
    .object({
      value: z.string(),
      encoding: hashEncodingSchema.optional(),
      position: z.enum(["prefix", "suffix"]).optional(),
    })
    .optional(),
  password: z
    .object({
      encoding: z
        .enum(["ascii", "utf8", "utf16le", "ucs2", "latin1", "binary"])
        .optional(),
    })
    .optional(),
  /** scrypt-only parameters; parsed for completeness, unsupported on write. */
  keylen: z.number().int().positive().optional(),
  cost: z.number().int().positive().optional(),
  blockSize: z.number().int().positive().optional(),
  parallelization: z.number().int().positive().optional(),
});
export type CustomPasswordHash = z.infer<typeof customPasswordHashSchema>;

const mfaFactorSchema = z.union([
  z.object({ totp: z.object({ secret: z.string() }) }),
  z.object({ phone: z.object({ value: z.string() }) }),
  z.object({ email: z.object({ value: z.string() }) }),
]);

/**
 * One entry in the import file. `email` is required by Auth0 for database
 * connections; `.passthrough()` keeps unrecognised keys so they can be
 * echoed back verbatim by `GET /jobs/{id}/errors`.
 */
export const userImportEntrySchema = z
  .object({
    user_id: z.string().optional(),
    email: z.string().email(),
    email_verified: z.boolean().optional(),
    username: z.string().optional(),
    blocked: z.boolean().optional(),
    phone_number: z.string().optional(),
    phone_verified: z.boolean().optional(),
    name: z.string().optional(),
    given_name: z.string().optional(),
    family_name: z.string().optional(),
    nickname: z.string().optional(),
    picture: z.string().optional(),
    app_metadata: z.record(z.string(), z.unknown()).optional(),
    user_metadata: z.record(z.string(), z.unknown()).optional(),
    mfa_factors: z.array(mfaFactorSchema).min(1).max(10).optional(),
    /**
     * Legacy single-field form. bcrypt only, and Auth0 only honours it on
     * the initial import (it never updates an existing password).
     */
    password_hash: z.string().optional(),
    /** Structured form; mutually exclusive with `password_hash`. */
    custom_password_hash: customPasswordHashSchema.optional(),
  })
  .passthrough()
  .refine((entry) => !(entry.password_hash && entry.custom_password_hash), {
    message: "password_hash and custom_password_hash are mutually exclusive",
    path: ["custom_password_hash"],
  });
export type UserImportEntry = z.infer<typeof userImportEntrySchema>;

/** The uploaded file: a JSON array of entries. */
export const userImportFileSchema = z.array(userImportEntrySchema);

/**
 * Auth0 job statuses. AuthHero's internal operation statuses are mapped
 * onto these at the API boundary — internal values never leak out.
 */
export const jobStatusSchema = z.enum(["pending", "completed", "failed"]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobSummarySchema = z.object({
  failed: z.number().int().default(0),
  updated: z.number().int().default(0),
  inserted: z.number().int().default(0),
  total: z.number().int().default(0),
});

export const jobSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: jobStatusSchema,
  created_at: z.string().optional(),
  connection_id: z.string().optional(),
  external_id: z.string().optional(),
  percentage_done: z.number().int().optional(),
  time_left_seconds: z.number().int().optional(),
  status_details: z.string().optional(),
  summary: jobSummarySchema.optional(),
});
export type Job = z.infer<typeof jobSchema>;

export const jobErrorSchema = z.object({
  user: z.record(z.string(), z.unknown()),
  errors: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      path: z.string().optional(),
    }),
  ),
});

export const jobErrorsSchema = z.array(jobErrorSchema);
