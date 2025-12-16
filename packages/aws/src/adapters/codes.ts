import {
  CodesAdapter,
  Code,
  CodeInsert,
  CodeType,
  ListCodesResponse,
  ListParams,
  codeSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { codeKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryItems,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface CodeItem extends DynamoDBBaseItem {
  code_id: string;
  tenant_id: string;
  code_type: CodeType;
  login_id: string;
  connection_id?: string;
  code_verifier?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  nonce?: string;
  state?: string;
  redirect_uri?: string;
  used_at?: string;
  expires_at: string;
  user_id?: string;
}

function toCode(item: CodeItem): Code {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);
  return codeSchema.parse(removeNullProperties(rest));
}

export function createCodesAdapter(ctx: DynamoDBContext): CodesAdapter {
  return {
    async create(tenantId: string, code: CodeInsert): Promise<Code> {
      const now = new Date().toISOString();

      const item: CodeItem = {
        PK: codeKeys.pk(tenantId),
        SK: codeKeys.sk(code.code_id, code.code_type),
        entityType: "CODE",
        code_id: code.code_id,
        tenant_id: tenantId,
        code_type: code.code_type,
        login_id: code.login_id,
        connection_id: code.connection_id,
        code_verifier: code.code_verifier,
        code_challenge: code.code_challenge,
        code_challenge_method: code.code_challenge_method,
        nonce: code.nonce,
        state: code.state,
        redirect_uri: code.redirect_uri,
        user_id: code.user_id,
        used_at: code.used_at,
        expires_at: code.expires_at,
        created_at: now,
        updated_at: now,
      };

      // Set TTL for automatic expiration
      (item as any).ttl = Math.floor(
        new Date(code.expires_at).getTime() / 1000,
      );

      await putItem(ctx, item);

      return toCode(item);
    },

    async get(
      tenantId: string,
      codeId: string,
      codeType: CodeType,
    ): Promise<Code | null> {
      const item = await getItem<CodeItem>(
        ctx,
        codeKeys.pk(tenantId),
        codeKeys.sk(codeId, codeType),
      );

      if (!item) return null;

      return toCode(item);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<ListCodesResponse> {
      const result = await queryWithPagination<CodeItem>(
        ctx,
        codeKeys.pk(tenantId),
        params,
        { skPrefix: "CODE#" },
      );

      return {
        codes: result.items.map(toCode),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async used(tenantId: string, codeId: string): Promise<boolean> {
      // Query using code_id prefix to find the code efficiently (O(1) lookup)
      const { items } = await queryItems<CodeItem>(
        ctx,
        codeKeys.pk(tenantId),
        {
          skPrefix: codeKeys.skPrefixByCodeId(codeId),
          limit: 1,
        },
      );

      const code = items[0];
      if (!code) return false;

      return updateItem(
        ctx,
        codeKeys.pk(tenantId),
        codeKeys.sk(codeId, code.code_type),
        { used_at: new Date().toISOString() },
      );
    },

    async remove(tenantId: string, codeId: string): Promise<boolean> {
      // Query using code_id prefix to find the code efficiently (O(1) lookup)
      const { items } = await queryItems<CodeItem>(
        ctx,
        codeKeys.pk(tenantId),
        {
          skPrefix: codeKeys.skPrefixByCodeId(codeId),
          limit: 1,
        },
      );

      const code = items[0];
      if (!code) return false;

      return deleteItem(
        ctx,
        codeKeys.pk(tenantId),
        codeKeys.sk(codeId, code.code_type),
      );
    },
  };
}
