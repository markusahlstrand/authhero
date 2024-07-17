import { Certificate } from "../types";

export interface KeysAdapter {
  create: (key: Certificate) => Promise<void>;
  list: () => Promise<Certificate[]>;
  revoke: (kid: string, revoke_at: Date) => Promise<boolean>;
}
