import { Certificate, SigningKey } from "../types";

export interface KeysAdapter {
  create: (key: SigningKey) => Promise<void>;
  list: () => Promise<(Certificate | SigningKey)[]>;
  revoke: (kid: string, revoke_at: Date) => Promise<boolean>;
}
