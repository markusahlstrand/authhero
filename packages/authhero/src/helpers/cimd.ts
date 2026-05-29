import { z } from "@hono/zod-openapi";
import { Client, clientSchema } from "@authhero/adapter-interfaces";
import { JSONHTTPException } from "../errors/json-http-exception";
import {
  ssrfSafeFetch,
  SsrfBlockedError,
  SsrfFetchOptions,
} from "../utils/ssrf-fetch";

// Client ID Metadata Documents (CIMD): the `client_id` is an https URL hosting
// the client's metadata. We fetch and validate it at request time instead of
// requiring pre-registration. Mirrors Auth0's CIMD support.

const MAX_CLIENT_ID_BYTES = 120;
const MAX_DOCUMENT_BYTES = 5 * 1024;

const CIMD_GRANT_TYPES = ["authorization_code", "refresh_token"] as const;

/**
 * Cheap guard: a CIMD client_id is an absolute https/http URL. Full validation
 * (length, path, fetch, document shape) happens in {@link resolveCimdClient}.
 */
export function isCimdClientId(clientId: string): boolean {
  if (!/^https?:\/\//i.test(clientId)) return false;
  try {
    new URL(clientId);
    return true;
  } catch {
    return false;
  }
}

export const cimdDocumentSchema = z.object({
  client_id: z.string().url(),
  client_name: z.string().min(1),
  grant_types: z
    .array(z.string())
    .refine((g) => g.some((t) => CIMD_GRANT_TYPES.includes(t as never)), {
      message: "grant_types must include authorization_code or refresh_token",
    }),
  redirect_uris: z.array(z.string().url()).optional(),
  application_type: z.enum(["native", "web"]).optional(),
  token_endpoint_auth_method: z.enum(["none", "private_key_jwt"]).optional(),
  jwks_uri: z.string().url().optional(),
});

export type CimdDocument = z.infer<typeof cimdDocumentSchema>;

function reject(message: string): never {
  throw new JSONHTTPException(400, {
    message: `Invalid CIMD client: ${message}`,
  });
}

/**
 * Enforce the structural constraints Auth0 applies to a CIMD URL. Scheme and
 * private-host blocking are delegated to {@link ssrfSafeFetch} (which honors
 * the test/dev `allowPrivateHosts` override), so these checks are scheme- and
 * host-agnostic and always safe to enforce.
 */
function assertValidCimdUrl(rawUrl: string): URL {
  if (Buffer.byteLength(rawUrl, "utf8") > MAX_CLIENT_ID_BYTES) {
    reject(`client_id exceeds ${MAX_CLIENT_ID_BYTES} bytes`);
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    reject("client_id is not a valid URL");
  }
  if (url.username || url.password) reject("URL must not contain credentials");
  if (url.hash) reject("URL must not contain a fragment");
  if (url.search) reject("URL must not contain a query string");
  if (url.port === "0") reject("URL must not use port 0");
  if (url.pathname === "" || url.pathname === "/") {
    reject("URL must contain a path");
  }
  return url;
}

function mapAppType(applicationType?: "native" | "web"): Client["app_type"] {
  if (applicationType === "native") return "native";
  return "regular_web";
}

/**
 * Fetch, validate, and map a CIMD document into a synthesized (un-persisted)
 * Client. The caller is responsible for the per-tenant flag check and for
 * composing tenant + connections into an EnrichedClient.
 *
 * @throws JSONHTTPException(400) on any URL, fetch, or document validation error.
 */
export async function resolveCimdClient(
  rawUrl: string,
  fetchOpts: SsrfFetchOptions = {},
): Promise<Client> {
  assertValidCimdUrl(rawUrl);

  let response: Awaited<ReturnType<typeof ssrfSafeFetch>>;
  try {
    response = await ssrfSafeFetch(rawUrl, {
      ...fetchOpts,
      maxBytes: MAX_DOCUMENT_BYTES,
    });
  } catch (e) {
    if (e instanceof SsrfBlockedError) {
      reject(e.message);
    }
    throw e;
  }

  if (response.status !== 200) {
    reject(`document fetch returned status ${response.status}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(response.body);
  } catch {
    reject("document is not valid JSON");
  }

  const parsed = cimdDocumentSchema.safeParse(json);
  if (!parsed.success) {
    reject(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const doc = parsed.data;

  // The document's client_id must exactly match the URL it was fetched from —
  // this binds the client identity to control of the URL.
  if (doc.client_id !== rawUrl) {
    reject("document client_id does not match the requested URL");
  }

  const authMethod = doc.token_endpoint_auth_method ?? "none";
  if (authMethod === "private_key_jwt" && !doc.jwks_uri) {
    reject(
      "jwks_uri is required when token_endpoint_auth_method is private_key_jwt",
    );
  }

  const grantTypes = doc.grant_types.filter((t) =>
    CIMD_GRANT_TYPES.includes(t as never),
  );

  const now = new Date().toISOString();

  // Parse through clientSchema so all defaulted fields are populated, then drop
  // the generated client_secret — CIMD clients are public and never have one.
  const client = clientSchema.parse({
    client_id: rawUrl,
    name: doc.client_name,
    app_type: mapAppType(doc.application_type),
    is_first_party: false,
    token_endpoint_auth_method: authMethod,
    grant_types: grantTypes,
    callbacks: doc.redirect_uris ?? [],
    connections: [],
    ...(doc.jwks_uri ? { client_metadata: { jwks_uri: doc.jwks_uri } } : {}),
    created_at: now,
    updated_at: now,
  });
  return { ...client, client_secret: undefined };
}
