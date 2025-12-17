import {
  KeysAdapter,
  SigningKey,
  ListParams,
  signingKeySchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { keyKeys } from "../keys";
import {
  putItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface KeyItem extends DynamoDBBaseItem {
  kid: string;
  cert: string;
  fingerprint: string;
  thumbprint: string;
  pkcs7?: string;
  current?: boolean;
  next?: boolean;
  previous?: boolean;
  current_since?: string;
  current_until?: string;
  revoked?: boolean;
  revoked_at?: string;
  connection?: string;
  type: "jwt_signing" | "saml_encryption";
}

function toSigningKey(item: KeyItem): SigningKey {
  return signingKeySchema.parse(removeNullProperties(stripDynamoDBFields(item)));
}

export function createKeysAdapter(ctx: DynamoDBContext): KeysAdapter {
  return {
    async create(key: SigningKey): Promise<void> {
      const now = new Date().toISOString();

      const item: KeyItem = {
        PK: keyKeys.pk(),
        SK: keyKeys.sk(key.kid),
        entityType: "KEY",
        kid: key.kid,
        cert: key.cert,
        fingerprint: key.fingerprint,
        thumbprint: key.thumbprint,
        pkcs7: key.pkcs7,
        current: key.current,
        next: key.next,
        previous: key.previous,
        current_since: key.current_since,
        current_until: key.current_until,
        revoked: key.revoked,
        revoked_at: key.revoked_at,
        connection: key.connection,
        type: key.type,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);
    },

    async list(
      params: ListParams = {},
    ): Promise<{ signingKeys: SigningKey[]; start: number; limit: number; length: number }> {
      const result = await queryWithPagination<KeyItem>(
        ctx,
        keyKeys.pk(),
        params,
        { skPrefix: "KEY#" },
      );

      return {
        signingKeys: result.items.map(toSigningKey),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async update(
      kid: string,
      key: Partial<Omit<SigningKey, "kid">>,
    ): Promise<boolean> {
      const updates = {
        ...key,
        updated_at: new Date().toISOString(),
      };

      return updateItem(ctx, keyKeys.pk(), keyKeys.sk(kid), updates);
    },
  };
}
