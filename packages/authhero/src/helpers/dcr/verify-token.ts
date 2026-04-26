import type {
  ClientRegistrationToken,
  ClientRegistrationTokensAdapter,
} from "@authhero/adapter-interfaces";
import { hashRegistrationToken } from "./mint-token";

export type VerifyFailure =
  | "not_found"
  | "wrong_type"
  | "expired"
  | "revoked"
  | "already_used";

export interface VerifyResult {
  ok: boolean;
  token?: ClientRegistrationToken;
  failure?: VerifyFailure;
}

export async function verifyRegistrationToken(
  adapter: ClientRegistrationTokensAdapter,
  tenant_id: string,
  plaintextToken: string,
  expectedType: "iat" | "rat",
): Promise<VerifyResult> {
  const token_hash = await hashRegistrationToken(plaintextToken);
  const token = await adapter.getByHash(tenant_id, token_hash);

  if (!token) {
    return { ok: false, failure: "not_found" };
  }
  if (token.type !== expectedType) {
    return { ok: false, failure: "wrong_type" };
  }
  if (token.revoked_at) {
    return { ok: false, failure: "revoked" };
  }
  if (token.expires_at && new Date(token.expires_at).getTime() <= Date.now()) {
    return { ok: false, failure: "expired" };
  }
  if (token.single_use && token.used_at) {
    return { ok: false, failure: "already_used" };
  }

  return { ok: true, token };
}
