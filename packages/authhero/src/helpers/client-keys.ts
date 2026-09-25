import { jwksKeySchema, Jwk } from "@authhero/adapter-interfaces";
import { ssrfSafeFetch, SsrfFetchOptions } from "../utils/ssrf-fetch";

export interface LoadClientKeysOptions {
  fetch?: SsrfFetchOptions;
}

/**
 * Subset of Client fields the JWKS loader actually reads. Narrower than
 * `Client` so callers can pass `EnrichedClient` (which redefines the
 * `connections` field shape) without structural mismatch.
 */
export interface ClientWithKeys {
  client_metadata?: Record<string, string> | undefined;
  registration_metadata?: Record<string, unknown> | undefined;
}

/**
 * Resolve a client's JWS verification keys. Per RFC 7591 §2 a client may
 * publish keys inline (`jwks`) or by reference (`jwks_uri`). Inline takes
 * precedence when both are present.
 *
 * jwks is stored on `client.registration_metadata.jwks` (DCR forward-compat
 * field); jwks_uri is stored on `client.client_metadata.jwks_uri`.
 *
 * Returns an empty array when the client has neither — callers must decide
 * whether that's allowed for the alg in question (HS* algs don't need it;
 * asymmetric algs do).
 */
export async function loadClientJwks(
  client: ClientWithKeys,
  opts: LoadClientKeysOptions = {},
): Promise<Jwk[]> {
  return loadJwks(
    {
      jwks: client.registration_metadata?.jwks,
      jwks_uri: client.client_metadata?.jwks_uri,
    },
    opts,
  );
}

/**
 * Resolve verification keys published inline (`jwks`) or by reference
 * (`jwks_uri`). Inline takes precedence. The remote fetch goes through the
 * SSRF guard. Returns an empty array when neither is set.
 */
export async function loadJwks(
  source: { jwks?: unknown; jwks_uri?: unknown },
  opts: LoadClientKeysOptions = {},
): Promise<Jwk[]> {
  const inline = source.jwks;
  if (inline && typeof inline === "object") {
    const parsed = jwksKeySchema.safeParse(inline);
    if (parsed.success) {
      return parsed.data.keys;
    }
    // Inline jwks present but malformed — fail closed rather than silently
    // falling back to jwks_uri (which would let an attacker who can write
    // garbage `jwks` force a remote fetch).
    throw new Error("Client has malformed inline jwks");
  }

  const jwksUri = source.jwks_uri;
  if (typeof jwksUri === "string" && jwksUri.length > 0) {
    const { status, body } = await ssrfSafeFetch(jwksUri, opts.fetch);
    if (status !== 200) {
      throw new Error(`jwks_uri returned status ${status}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("jwks_uri did not return valid JSON");
    }
    const validated = jwksKeySchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error("jwks_uri response is not a valid JWKS");
    }
    return validated.data.keys;
  }

  return [];
}
