import { SigningKey } from "../types";

export interface KeysAdapter {
  create: (key: SigningKey) => Promise<void>;
  list: () => Promise<SigningKey[]>;
  update: (
    kid: string,
    key: Partial<Omit<SigningKey, "kid">>,
  ) => Promise<boolean>;
}
