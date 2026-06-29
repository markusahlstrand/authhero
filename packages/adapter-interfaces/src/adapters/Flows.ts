import { Flow, FlowInsert, Totals } from "../types";
import { ListParams } from "../types/ListParams";
import { CreateOptions } from "../types/ImportMetadata";

export interface ListFlowsResponse extends Totals {
  flows: Flow[];
}

export interface FlowsAdapter {
  create(
    tenant_id: string,
    params: FlowInsert,
    options?: CreateOptions,
  ): Promise<Flow>;
  get(tenant_id: string, flow_id: string): Promise<Flow | null>;
  remove(tenant_id: string, flow_id: string): Promise<boolean>;
  update(
    tenant_id: string,
    flow_id: string,
    flow: Partial<FlowInsert>,
  ): Promise<Flow | null>;
  list(tenant_id: string, params?: ListParams): Promise<ListFlowsResponse>;
}
