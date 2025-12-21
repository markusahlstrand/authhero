import { nanoid } from "nanoid";
import {
  FlowsAdapter,
  Flow,
  FlowInsert,
  ListFlowsResponse,
  ListParams,
  flowSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { flowKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface FlowItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  name: string;
  actions?: string; // JSON array string
}

function toFlow(item: FlowItem): Flow {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);

  let actions: unknown[] = [];
  if (item.actions) {
    try {
      actions = JSON.parse(item.actions);
    } catch {
      // If JSON parsing fails, default to empty array
      console.error(`Failed to parse actions JSON for flow ${item.id}`);
    }
  }

  const data = removeNullProperties({
    ...rest,
    actions,
  });

  return flowSchema.parse(data);
}

export function createFlowsAdapter(ctx: DynamoDBContext): FlowsAdapter {
  return {
    async create(tenantId: string, flow: FlowInsert): Promise<Flow> {
      const now = new Date().toISOString();
      const id = `af_${nanoid()}`;

      const item: FlowItem = {
        PK: flowKeys.pk(tenantId),
        SK: flowKeys.sk(id),
        entityType: "FLOW",
        tenant_id: tenantId,
        id,
        name: flow.name,
        actions: flow.actions ? JSON.stringify(flow.actions) : undefined,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return toFlow(item);
    },

    async get(tenantId: string, flowId: string): Promise<Flow | null> {
      const item = await getItem<FlowItem>(
        ctx,
        flowKeys.pk(tenantId),
        flowKeys.sk(flowId),
      );

      if (!item) return null;

      return toFlow(item);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<ListFlowsResponse> {
      const result = await queryWithPagination<FlowItem>(
        ctx,
        flowKeys.pk(tenantId),
        params,
        { skPrefix: "FLOW#" },
      );

      return {
        flows: result.items.map(toFlow),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async update(
      tenantId: string,
      flowId: string,
      flow: Partial<FlowInsert>,
    ): Promise<Flow | null> {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (flow.name !== undefined) updates.name = flow.name;
      if (flow.actions !== undefined)
        updates.actions = JSON.stringify(flow.actions);

      const success = await updateItem(
        ctx,
        flowKeys.pk(tenantId),
        flowKeys.sk(flowId),
        updates,
      );

      if (!success) return null;

      // Fetch and return the updated flow
      return this.get(tenantId, flowId);
    },

    async remove(tenantId: string, flowId: string): Promise<boolean> {
      return deleteItem(ctx, flowKeys.pk(tenantId), flowKeys.sk(flowId));
    },
  };
}
