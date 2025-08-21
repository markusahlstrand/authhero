import { SigningKey, Totals } from "../types";
import { ListParams } from "../types/ListParams";

export interface ListKeysResponse extends Totals {
  signingKeys: SigningKey[];
}

export interface KeysAdapter {
  create: (key: SigningKey) => Promise<void>;
  list: (params?: ListParams) => Promise<ListKeysResponse>;
  update: (
    kid: string,
    key: Partial<Omit<SigningKey, "kid">>,
  ) => Promise<boolean>;
}
