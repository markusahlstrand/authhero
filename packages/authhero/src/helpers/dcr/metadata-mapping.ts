import { z } from "@hono/zod-openapi";
import type { Client, ClientInsert } from "@authhero/adapter-interfaces";

/**
 * RFC 7591 §2 client metadata accepted at the DCR endpoint. Auth0's
 * Management API uses `callbacks`; we map from RFC-standard `redirect_uris`
 * at the wire boundary and back on response.
 *
 * The schema is strict (not passthrough) — unknown fields in the request
 * are ignored rather than being echoed to the response. Forward-compat for
 * RFC 7591 unknown fields can be added later via a separate `extensions`
 * field or a `.passthrough()` once the dts-bundle-generator config allows
 * the wider type.
 */
export const dcrRequestSchema = z.object({
  redirect_uris: z.array(z.string()).optional(),
  client_name: z.string().min(1).optional(),
  client_uri: z.string().url().optional(),
  logo_uri: z.string().url().optional(),
  tos_uri: z.string().url().optional(),
  policy_uri: z.string().url().optional(),
  contacts: z.array(z.string()).optional(),
  scope: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_basic", "client_secret_post"])
    .optional(),
  jwks_uri: z.string().url().optional(),
  jwks: z.record(z.unknown()).optional(),
  software_id: z.string().optional(),
  software_version: z.string().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

export type DcrRequest = z.infer<typeof dcrRequestSchema>;

export const dcrResponseSchema = z.object({
  client_id: z.string(),
  client_secret: z.string().optional(),
  client_id_issued_at: z.number().optional(),
  client_secret_expires_at: z.number().optional(),
  registration_access_token: z.string().optional(),
  registration_client_uri: z.string(),
  client_name: z.string().optional(),
  redirect_uris: z.array(z.string()).optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
  logo_uri: z.string().optional(),
  client_uri: z.string().optional(),
  tos_uri: z.string().optional(),
  policy_uri: z.string().optional(),
  contacts: z.array(z.string()).optional(),
  scope: z.string().optional(),
  jwks_uri: z.string().optional(),
  software_id: z.string().optional(),
  software_version: z.string().optional(),
});

export type DcrResponse = z.infer<typeof dcrResponseSchema>;

/**
 * Keys we treat as first-class RFC 7591 fields handled explicitly below.
 * Anything else falls into `registration_metadata` so the client gets echoed
 * what it sent while we still forward-compat.
 */
const KNOWN_RFC_7591_FIELDS = new Set([
  "redirect_uris",
  "client_name",
  "client_uri",
  "logo_uri",
  "tos_uri",
  "policy_uri",
  "contacts",
  "scope",
  "grant_types",
  "response_types",
  "token_endpoint_auth_method",
  "jwks_uri",
  "jwks",
  "software_id",
  "software_version",
  // AuthHero-internal fields the /connect/start flow (Phase 4) may set
  // through IAT constraints but which are not RFC 7591 metadata.
  "domain",
  "integration_type",
]);

export interface RegistrationMapping {
  /** Fields suitable for ClientInsert (subset of Client). */
  clientFields: Partial<ClientInsert>;
  /** Additional metadata preserved on the client for round-trip. */
  extraMetadata: Record<string, unknown>;
}

function pickClientMetadataExtras(
  req: DcrRequest,
): Record<string, string> | undefined {
  const entries: [string, string][] = [];
  for (const key of [
    "client_uri",
    "tos_uri",
    "policy_uri",
    "jwks_uri",
    "software_id",
    "software_version",
  ] as const) {
    const value = req[key];
    if (typeof value === "string" && value.length > 0) {
      entries.push([key, value]);
    }
  }
  if (req.contacts && Array.isArray(req.contacts) && req.contacts.length > 0) {
    entries.push(["contacts", req.contacts.join(",")]);
  }
  if (req.scope && typeof req.scope === "string") {
    entries.push(["scope", req.scope]);
  }
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Map an RFC 7591 DCR request to internal Client fields.
 */
export function dcrRequestToClient(req: DcrRequest): RegistrationMapping {
  const clientFields: Partial<ClientInsert> = {};

  if (req.client_name !== undefined) clientFields.name = req.client_name;
  if (req.redirect_uris !== undefined)
    clientFields.callbacks = req.redirect_uris;
  if (req.grant_types !== undefined) clientFields.grant_types = req.grant_types;
  if (req.token_endpoint_auth_method !== undefined) {
    clientFields.token_endpoint_auth_method = req.token_endpoint_auth_method;
  }
  if (req.logo_uri !== undefined) clientFields.logo_uri = req.logo_uri;

  const clientMetadataExtras = pickClientMetadataExtras(req);
  if (clientMetadataExtras) {
    clientFields.client_metadata = clientMetadataExtras;
  }

  const extraMetadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(req)) {
    if (!KNOWN_RFC_7591_FIELDS.has(key)) {
      extraMetadata[key] = value;
    }
  }
  if (req.jwks !== undefined) {
    extraMetadata.jwks = req.jwks;
  }
  if (req.response_types !== undefined) {
    extraMetadata.response_types = req.response_types;
  }

  return { clientFields, extraMetadata };
}

function readMetadataString(
  metadata: Record<string, string>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return value && value.length > 0 ? value : undefined;
}

/**
 * Build the RFC 7591 §3.2.1 response body from a stored Client plus the
 * issuance artifacts generated at registration time.
 */
export function clientToDcrResponse(
  client: Client,
  opts: {
    client_secret?: string;
    registration_access_token?: string;
    registration_client_uri: string;
    include_client_secret: boolean;
  },
): DcrResponse {
  const metadata: Record<string, string> = client.client_metadata ?? {};
  const contactsRaw = metadata.contacts;
  const contacts =
    contactsRaw && contactsRaw.length > 0 ? contactsRaw.split(",") : undefined;

  const registrationMetadata: Record<string, unknown> =
    client.registration_metadata ?? {};
  const storedResponseTypes = registrationMetadata.response_types;
  const response_types =
    Array.isArray(storedResponseTypes) &&
    storedResponseTypes.every((v): v is string => typeof v === "string")
      ? storedResponseTypes
      : undefined;

  const response: DcrResponse = {
    client_id: client.client_id,
    client_name: client.name,
    client_id_issued_at: Math.floor(
      new Date(client.created_at).getTime() / 1000,
    ),
    client_secret_expires_at: 0,
    registration_client_uri: opts.registration_client_uri,
    client_secret:
      opts.include_client_secret && opts.client_secret
        ? opts.client_secret
        : undefined,
    registration_access_token: opts.registration_access_token,
    redirect_uris:
      client.callbacks && client.callbacks.length > 0
        ? client.callbacks
        : undefined,
    grant_types:
      client.grant_types && client.grant_types.length > 0
        ? client.grant_types
        : undefined,
    response_types,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    logo_uri: client.logo_uri,
    client_uri: readMetadataString(metadata, "client_uri"),
    tos_uri: readMetadataString(metadata, "tos_uri"),
    policy_uri: readMetadataString(metadata, "policy_uri"),
    jwks_uri: readMetadataString(metadata, "jwks_uri"),
    software_id: readMetadataString(metadata, "software_id"),
    software_version: readMetadataString(metadata, "software_version"),
    scope: readMetadataString(metadata, "scope"),
    contacts,
  };

  return response;
}
