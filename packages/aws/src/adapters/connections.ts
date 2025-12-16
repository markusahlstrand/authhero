import { nanoid } from "nanoid";
import {
  ConnectionsAdapter,
  Connection,
  ConnectionInsert,
  ListConnectionsResponse,
  ListParams,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { connectionKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface ConnectionItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  name: string;
  strategy: string;
  options?: string; // JSON string
}

function toConnection(item: ConnectionItem): Connection {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);

  return removeNullProperties({
    ...rest,
    options: item.options ? JSON.parse(item.options) : undefined,
  }) as Connection;
}

export function createConnectionsAdapter(
  ctx: DynamoDBContext,
): ConnectionsAdapter {
  return {
    async create(
      tenantId: string,
      params: ConnectionInsert,
    ): Promise<Connection> {
      const now = new Date().toISOString();
      const id = params.id || nanoid();

      const item: ConnectionItem = {
        PK: connectionKeys.pk(tenantId),
        SK: connectionKeys.sk(id),
        GSI1PK: connectionKeys.gsi1pk(tenantId, params.name),
        GSI1SK: connectionKeys.gsi1sk(),
        entityType: "CONNECTION",
        tenant_id: tenantId,
        id,
        name: params.name,
        strategy: params.strategy,
        options: params.options ? JSON.stringify(params.options) : undefined,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return toConnection(item);
    },

    async get(
      tenantId: string,
      connectionId: string,
    ): Promise<Connection | null> {
      const item = await getItem<ConnectionItem>(
        ctx,
        connectionKeys.pk(tenantId),
        connectionKeys.sk(connectionId),
      );

      if (!item) return null;

      return toConnection(item);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<ListConnectionsResponse> {
      const result = await queryWithPagination<ConnectionItem>(
        ctx,
        connectionKeys.pk(tenantId),
        params,
        { skPrefix: "CONNECTION#" },
      );

      return {
        connections: result.items.map(toConnection),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async update(
      tenantId: string,
      connectionId: string,
      params: Partial<ConnectionInsert>,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        ...params,
        updated_at: new Date().toISOString(),
      };

      if (params.options !== undefined) {
        updates.options = JSON.stringify(params.options);
      }

      // Remove id from updates
      delete updates.id;

      return updateItem(
        ctx,
        connectionKeys.pk(tenantId),
        connectionKeys.sk(connectionId),
        updates,
      );
    },

    async remove(tenantId: string, connectionId: string): Promise<boolean> {
      return deleteItem(
        ctx,
        connectionKeys.pk(tenantId),
        connectionKeys.sk(connectionId),
      );
    },
  };
}
