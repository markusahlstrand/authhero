import { Ticket } from "../types";

export interface TicketsAdapter {
  create: (ticket: Ticket) => Promise<void>;
  get: (tenant_id: string, id: string) => Promise<Ticket | null>;
  remove: (tenant_id: string, id: string) => Promise<void>;
}
