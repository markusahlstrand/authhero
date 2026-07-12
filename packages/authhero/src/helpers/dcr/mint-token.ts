import { encodeBase64Url, encodeHex } from "@authhero/adapter-interfaces";
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
  return encodeHex(await crypto.subtle.digest("SHA-256", encoded));
}

export async function mintRegistrationToken(): Promise<GeneratedRegistrationToken> {
  const token = encodeBase64Url(randomBytes(32));
  const token_hash = await hashRegistrationToken(token);
  return {
    id: nanoid(),
    token,
    token_hash,
  };
}
