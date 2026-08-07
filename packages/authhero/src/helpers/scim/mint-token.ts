import { encodeBase64Url, encodeHex } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";

export interface GeneratedScimToken {
  token_id: string;
  token: string;
  token_hash: string;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * SHA-256 hex of the raw bearer token. The SCIM auth middleware (Phase 2)
 * hashes the presented token the same way and looks it up via `getByHash`.
 */
export async function hashScimToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  return encodeHex(await crypto.subtle.digest("SHA-256", encoded));
}

export async function mintScimToken(): Promise<GeneratedScimToken> {
  const token = encodeBase64Url(randomBytes(32));
  const token_hash = await hashScimToken(token);
  return {
    token_id: `scimtok_${nanoid()}`,
    token,
    token_hash,
  };
}
