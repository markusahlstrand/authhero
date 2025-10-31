import { Log, LogInsert, Totals } from "../types";
import { ListParams } from "../types/ListParams";

interface ListLogsResponse extends Totals {
  logs: Log[];
}

export interface LogsDataAdapter {
  create(tenantId: string, params: LogInsert): Promise<Log>;
  list(tenantId: string, params?: ListParams): Promise<ListLogsResponse>;
  get(tenantId: string, logId: string): Promise<Log | null>;
}
