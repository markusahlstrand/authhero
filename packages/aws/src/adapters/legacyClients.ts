import { LegacyClientsAdapter, LegacyClient } from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { legacyClientKeys } from "../keys";
import { getItem, stripDynamoDBFields, removeNullProperties } from "../utils";

interface LegacyClientItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  client_id: string;
  client_secret?: string;
  name?: string;
}

function toLegacyClient(item: LegacyClientItem): LegacyClient {
  return removeNullProperties(stripDynamoDBFields(item)) as unknown as LegacyClient;
}

export function createLegacyClientsAdapter(
  ctx: DynamoDBContext,
): LegacyClientsAdapter {
  return {
    async get(id: string): Promise<LegacyClient | null> {
      const item = await getItem<LegacyClientItem>(
        ctx,
        legacyClientKeys.pk(),
        legacyClientKeys.sk(id),
      );

      if (!item) return null;

      return toLegacyClient(item);
    },
  };
}
