import { Client } from "../types";

export interface ClientsAdapter {
  get: (id: string) => Promise<Client | null>;
}
