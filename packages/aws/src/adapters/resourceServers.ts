import { nanoid } from "nanoid";
import {
  ResourceServersAdapter,
  ResourceServer,
  ResourceServerInsert,
  ListResourceServersResponse,
  ListParams,
  resourceServerSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { resourceServerKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface ResourceServerItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  identifier: string;
  name: string;
  signing_alg?: string;
  signing_secret?: string;
  allow_offline_access?: boolean;
  skip_consent_for_verifiable_first_party_clients?: boolean;
  token_lifetime?: number;
  token_lifetime_for_web?: number;
  enforce_policies?: boolean;
  token_dialect?: string;
  scopes?: string; // JSON array string
  options?: string; // JSON string
  verification_key?: string;
  is_system?: boolean;
}

function toResourceServer(item: ResourceServerItem): ResourceServer {
  const { tenant_id, verification_key, is_system, ...rest } =
    stripDynamoDBFields(item);

  const data = removeNullProperties({
    ...rest,
    verificationKey: verification_key,
    scopes: item.scopes ? JSON.parse(item.scopes) : undefined,
    options: item.options ? JSON.parse(item.options) : undefined,
    is_system: is_system ? true : undefined,
  });

  return resourceServerSchema.parse(data);
}

export function createResourceServersAdapter(
  ctx: DynamoDBContext,
): ResourceServersAdapter {
  return {
    async create(
      tenantId: string,
      params: ResourceServerInsert,
    ): Promise<ResourceServer> {
      const now = new Date().toISOString();
      const id = nanoid();

      const item: ResourceServerItem = {
        PK: resourceServerKeys.pk(tenantId),
        SK: resourceServerKeys.sk(id),
        GSI1PK: resourceServerKeys.gsi1pk(tenantId, params.identifier),
        GSI1SK: resourceServerKeys.gsi1sk(),
        entityType: "RESOURCE_SERVER",
        tenant_id: tenantId,
        id,
        identifier: params.identifier,
        name: params.name,
        signing_alg: params.signing_alg,
        signing_secret: params.signing_secret,
        allow_offline_access: params.allow_offline_access,
        skip_consent_for_verifiable_first_party_clients:
          params.skip_consent_for_verifiable_first_party_clients,
        token_lifetime: params.token_lifetime,
        token_lifetime_for_web: params.token_lifetime_for_web,
        enforce_policies: params.options?.enforce_policies,
        token_dialect: params.options?.token_dialect,
        scopes: params.scopes ? JSON.stringify(params.scopes) : undefined,
        options: params.options ? JSON.stringify(params.options) : undefined,
        verification_key: params.verificationKey,
        is_system: params.is_system ?? false,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return toResourceServer(item);
    },

    async get(tenantId: string, id: string): Promise<ResourceServer | null> {
      const item = await getItem<ResourceServerItem>(
        ctx,
        resourceServerKeys.pk(tenantId),
        resourceServerKeys.sk(id),
      );

      if (!item) return null;

      return toResourceServer(item);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<ListResourceServersResponse> {
      const result = await queryWithPagination<ResourceServerItem>(
        ctx,
        resourceServerKeys.pk(tenantId),
        params,
        { skPrefix: "RESOURCE_SERVER#" },
      );

      return {
        resource_servers: result.items.map(toResourceServer),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async update(
      tenantId: string,
      id: string,
      resourceServer: Partial<ResourceServerInsert>,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        ...resourceServer,
        updated_at: new Date().toISOString(),
      };

      if (resourceServer.scopes !== undefined) {
        updates.scopes = JSON.stringify(resourceServer.scopes);
      }
      if (resourceServer.options !== undefined) {
        updates.options = JSON.stringify(resourceServer.options);
      }
      if (resourceServer.verificationKey !== undefined) {
        updates.verification_key = resourceServer.verificationKey;
        delete updates.verificationKey;
      }

      // Remove id from updates
      delete updates.id;

      return updateItem(
        ctx,
        resourceServerKeys.pk(tenantId),
        resourceServerKeys.sk(id),
        updates,
      );
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      return deleteItem(
        ctx,
        resourceServerKeys.pk(tenantId),
        resourceServerKeys.sk(id),
      );
    },
  };
}
