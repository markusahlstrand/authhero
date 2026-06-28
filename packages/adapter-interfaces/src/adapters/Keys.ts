import { SigningKey, Totals } from "../types";
import { ListParams } from "../types/ListParams";
import { CreateOptions } from "../types/ImportMetadata";

export interface ListKeysResponse extends Totals {
  signingKeys: SigningKey[];
}

export interface KeysAdapter {
  create: (key: SigningKey, options?: CreateOptions) => Promise<void>;
  list: (params?: ListParams) => Promise<ListKeysResponse>;
  update: (
    kid: string,
    key: Partial<Omit<SigningKey, "kid">>,
  ) => Promise<boolean>;
}
