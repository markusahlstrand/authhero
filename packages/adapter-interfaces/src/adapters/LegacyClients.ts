import { LegacyClient } from "../types";

export interface LegacyClientsAdapter {
  get: (id: string) => Promise<LegacyClient | null>;
}
