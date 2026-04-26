import { sha256 } from "oslo/crypto";
import { base64url, encodeHex } from "oslo/encoding";
import { nanoid } from "nanoid";

export interface GeneratedRegistrationToken {
  id: string;
  token: string;
  token_hash: string;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function hashRegistrationToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  return encodeHex(await sha256(encoded));
}

export async function mintRegistrationToken(): Promise<GeneratedRegistrationToken> {
  const token = base64url.encode(randomBytes(32), { includePadding: false });
  const token_hash = await hashRegistrationToken(token);
  return {
    id: nanoid(),
    token,
    token_hash,
  };
}
