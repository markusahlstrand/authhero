import { nanoid } from "nanoid";
import {
  PasswordsAdapter,
  Password,
  PasswordInsert,
  passwordSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { passwordKeys } from "../keys";
import {
  putItem,
  updateItem,
  queryItems,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface PasswordItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  user_id: string;
  password: string;
  algorithm: "bcrypt" | "argon2id";
  is_current: boolean;
}

function toPassword(item: PasswordItem): Password {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);
  return passwordSchema.parse(removeNullProperties(rest));
}

export function createPasswordsAdapter(
  ctx: DynamoDBContext,
): PasswordsAdapter {
  return {
    async create(tenantId: string, params: PasswordInsert): Promise<Password> {
      const now = new Date().toISOString();
      const id = nanoid();

      // First, mark all existing passwords as not current
      const existingPasswords = await this.list(tenantId, params.user_id);
      for (const pwd of existingPasswords) {
        if (pwd.is_current) {
          await updateItem(
            ctx,
            passwordKeys.pk(tenantId, params.user_id),
            passwordKeys.sk(pwd.id),
            { is_current: false, updated_at: now },
          );
        }
      }

      const item: PasswordItem = {
        PK: passwordKeys.pk(tenantId, params.user_id),
        SK: passwordKeys.sk(id),
        entityType: "PASSWORD",
        id,
        tenant_id: tenantId,
        user_id: params.user_id,
        password: params.password,
        algorithm: params.algorithm || "bcrypt",
        is_current: true,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return toPassword(item);
    },

    async update(tenantId: string, params: PasswordInsert): Promise<boolean> {
      // Update is essentially creating a new password
      await this.create(tenantId, params);
      return true;
    },

    async get(tenantId: string, userId: string): Promise<Password | null> {
      // Get the current password
      const { items } = await queryItems<PasswordItem>(
        ctx,
        passwordKeys.pk(tenantId, userId),
        { skPrefix: passwordKeys.skPrefix() },
      );

      const currentPassword = items.find((item) => item.is_current);
      if (!currentPassword) return null;

      return toPassword(currentPassword);
    },

    async list(
      tenantId: string,
      userId: string,
      limit?: number,
    ): Promise<Password[]> {
      const { items } = await queryItems<PasswordItem>(
        ctx,
        passwordKeys.pk(tenantId, userId),
        {
          skPrefix: passwordKeys.skPrefix(),
          limit,
        },
      );

      return items.map(toPassword);
    },
  };
}
