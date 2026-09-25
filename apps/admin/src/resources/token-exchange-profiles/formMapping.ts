/**
 * Mapping between a token exchange profile and the create/edit form.
 *
 * The form carries a few UI-only fields: `mode` (action vs. JWT
 * verification), `keys_source` (JWKS URL vs. pasted JWKS) and `jwks_json`
 * (the pasted JWKS as text). These functions are the only place they are
 * derived from, and folded back into, the API shape.
 */

export const TOKEN_EXCHANGE_ALGORITHMS = [
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "ES512",
] as const;

// Mirrors RESERVED_SUBJECT_TOKEN_TYPE_PREFIXES in adapter-interfaces.
const RESERVED_PREFIXES = [
  "urn:ietf:params:oauth:",
  "urn:auth0",
  "urn:okta",
  "http://auth0.com",
  "https://auth0.com",
  "http://okta.com",
  "https://okta.com",
];

export const DEFAULT_MAX_LIFETIME_SECONDS = 300;

export type ProfileMode = "jwt" | "action";
export type KeysSource = "jwks_uri" | "jwks";

type UserMappingValues = {
  type?: "connection" | "user_id";
  connection?: string | null;
  create_if_not_exists?: boolean | null;
  trust_email_verified?: boolean | null;
};

type JwtVerificationValues = {
  issuer?: string | null;
  jwks?: unknown;
  jwks_uri?: string | null;
  audience?: string[] | null;
  algorithms?: string[] | null;
  max_lifetime_seconds?: number | null;
  require_jti?: boolean | null;
  user_mapping?: UserMappingValues | null;
};

export type ProfileFormValues = {
  id?: string | number;
  name?: string;
  subject_token_type?: string;
  type?: string;
  action_id?: string | null;
  jwt_verification?: JwtVerificationValues | null;
  mode?: ProfileMode;
  keys_source?: KeysSource;
  jwks_json?: string | null;
} & Record<string, unknown>;

export function validateSubjectTokenType(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (!value.startsWith("https://") && !value.startsWith("urn:")) {
    return "Must be a URI starting with https:// or urn:";
  }
  const lower = value.toLowerCase();
  if (RESERVED_PREFIXES.some((p) => lower.startsWith(p))) {
    return "This namespace is reserved";
  }
  return undefined;
}

export function validateJwksJson(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("keys" in parsed) ||
      !Array.isArray(parsed.keys)
    ) {
      return 'Must be a JWKS object with a "keys" array';
    }
  } catch {
    return "Must be valid JSON";
  }
  return undefined;
}

/** Record → form values. */
export function toProfileFormValues(
  record: ProfileFormValues,
): ProfileFormValues {
  const jwt = record.jwt_verification;
  return {
    ...record,
    mode: record.action_id ? "action" : "jwt",
    keys_source: jwt?.jwks ? "jwks" : "jwks_uri",
    jwks_json: jwt?.jwks ? JSON.stringify(jwt.jwks, null, 2) : "",
  };
}

function buildJwtVerification(
  values: ProfileFormValues,
): Record<string, unknown> {
  const jwt = values.jwt_verification ?? {};
  const out: Record<string, unknown> = {
    issuer: (jwt.issuer ?? "").trim(),
  };

  if (values.keys_source === "jwks") {
    out.jwks = JSON.parse(values.jwks_json ?? "");
  } else {
    out.jwks_uri = (jwt.jwks_uri ?? "").trim();
  }

  const audience = (jwt.audience ?? []).map((a) => a.trim()).filter(Boolean);
  if (audience.length) out.audience = audience;

  const algorithms = (jwt.algorithms ?? []).filter(Boolean);
  if (algorithms.length) out.algorithms = algorithms;

  out.max_lifetime_seconds =
    typeof jwt.max_lifetime_seconds === "number"
      ? jwt.max_lifetime_seconds
      : DEFAULT_MAX_LIFETIME_SECONDS;
  out.require_jti = jwt.require_jti ?? true;

  const mapping = jwt.user_mapping ?? {};
  out.user_mapping =
    mapping.type === "user_id"
      ? { type: "user_id" }
      : {
          type: "connection",
          connection: mapping.connection ?? "",
          create_if_not_exists: mapping.create_if_not_exists ?? true,
          trust_email_verified: mapping.trust_email_verified ?? false,
        };

  return out;
}

/**
 * Form values → create payload. Sends the action or the JWT verification
 * block depending on the chosen mode, never both.
 */
export function fromProfileCreateValues(
  values: ProfileFormValues,
): Record<string, unknown> {
  const base = {
    name: values.name,
    subject_token_type: values.subject_token_type,
    type: "custom_authentication",
  };
  return values.mode === "action"
    ? { ...base, action_id: values.action_id }
    : { ...base, jwt_verification: buildJwtVerification(values) };
}

/**
 * Form values → update payload. `action_id` is immutable, so an action
 * profile only ever sends its name and subject token type.
 */
export function fromProfileUpdateValues(
  values: ProfileFormValues,
): Record<string, unknown> {
  const base = {
    name: values.name,
    subject_token_type: values.subject_token_type,
  };
  return values.action_id
    ? base
    : { ...base, jwt_verification: buildJwtVerification(values) };
}
