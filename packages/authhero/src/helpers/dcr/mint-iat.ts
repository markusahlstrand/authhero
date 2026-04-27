import type {
  ClientRegistrationToken,
  ClientRegistrationTokensAdapter,
} from "@authhero/adapter-interfaces";
import { mintRegistrationToken } from "./mint-token";

const DEFAULT_EXPIRES_IN_SECONDS = 300;

export interface MintIatOptions {
  sub?: string;
  constraints?: Record<string, unknown>;
  expires_in_seconds?: number;
  single_use?: boolean;
}

export interface MintedIat {
  id: string;
  token: string;
  expires_at: string;
  record: ClientRegistrationToken;
}

export async function mintIat(
  adapter: ClientRegistrationTokensAdapter,
  tenant_id: string,
  opts: MintIatOptions = {},
): Promise<MintedIat> {
  const generated = await mintRegistrationToken();
  const expires_in =
    opts.expires_in_seconds ?? DEFAULT_EXPIRES_IN_SECONDS;
  const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

  const record = await adapter.create(tenant_id, {
    id: generated.id,
    token_hash: generated.token_hash,
    type: "iat",
    sub: opts.sub,
    constraints: opts.constraints,
    single_use: opts.single_use ?? true,
    expires_at,
  });

  return {
    id: generated.id,
    token: generated.token,
    expires_at,
    record,
  };
}
