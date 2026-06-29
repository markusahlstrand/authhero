import { LogStream, LogStreamInsert } from "../types/LogStream";
import { CreateOptions } from "../types/ImportMetadata";

export interface LogStreamsAdapter {
  create(
    tenant_id: string,
    params: LogStreamInsert,
    options?: CreateOptions,
  ): Promise<LogStream>;
  get(tenant_id: string, id: string): Promise<LogStream | null>;
  list(tenant_id: string): Promise<LogStream[]>;
  update(
    tenant_id: string,
    id: string,
    params: Partial<LogStream>,
  ): Promise<boolean>;
  remove(tenant_id: string, id: string): Promise<boolean>;
}
