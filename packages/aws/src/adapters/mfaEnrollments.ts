import {
  MfaEnrollmentsAdapter,
  MfaEnrollment,
  MfaEnrollmentInsert,
  mfaEnrollmentSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { mfaEnrollmentKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryItems,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";
import { nanoid } from "nanoid";

interface MfaEnrollmentItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  user_id: string;
  type: string;
  phone_number?: string;
  totp_secret?: string;
  confirmed: boolean;
  created_at: string;
  updated_at: string;
}

function toMfaEnrollment(item: MfaEnrollmentItem): MfaEnrollment {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);
  return mfaEnrollmentSchema.parse(removeNullProperties(rest));
}

export function createMfaEnrollmentsAdapter(
  ctx: DynamoDBContext,
): MfaEnrollmentsAdapter {
  return {
    async create(
      tenantId: string,
      enrollment: MfaEnrollmentInsert,
    ): Promise<MfaEnrollment> {
      const now = new Date().toISOString();
      const id = nanoid();

      const item: MfaEnrollmentItem = {
        PK: mfaEnrollmentKeys.pk(tenantId),
        SK: mfaEnrollmentKeys.sk(id),
        GSI1PK: mfaEnrollmentKeys.gsi1pk(tenantId, enrollment.user_id),
        GSI1SK: mfaEnrollmentKeys.gsi1sk(id),
        entityType: "MFA_ENROLLMENT",
        id,
        tenant_id: tenantId,
        user_id: enrollment.user_id,
        type: enrollment.type,
        phone_number: enrollment.phone_number,
        totp_secret: enrollment.totp_secret,
        confirmed: enrollment.confirmed ?? false,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);
      return toMfaEnrollment(item);
    },

    async get(
      tenantId: string,
      enrollmentId: string,
    ): Promise<MfaEnrollment | null> {
      const item = await getItem<MfaEnrollmentItem>(
        ctx,
        mfaEnrollmentKeys.pk(tenantId),
        mfaEnrollmentKeys.sk(enrollmentId),
      );

      if (!item) return null;
      return toMfaEnrollment(item);
    },

    async list(tenantId: string, userId: string): Promise<MfaEnrollment[]> {
      const result = await queryItems<MfaEnrollmentItem>(
        ctx,
        mfaEnrollmentKeys.gsi1pk(tenantId, userId),
        {
          skPrefix: mfaEnrollmentKeys.gsi1skPrefix(),
          indexName: "GSI1",
        },
      );

      return result.items.map(toMfaEnrollment);
    },

    async update(
      tenantId: string,
      enrollmentId: string,
      data: Partial<MfaEnrollmentInsert>,
    ): Promise<MfaEnrollment> {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (data.phone_number !== undefined)
        updates.phone_number = data.phone_number;
      if (data.totp_secret !== undefined)
        updates.totp_secret = data.totp_secret;
      if (data.confirmed !== undefined) updates.confirmed = data.confirmed;

      await updateItem(
        ctx,
        mfaEnrollmentKeys.pk(tenantId),
        mfaEnrollmentKeys.sk(enrollmentId),
        updates,
      );

      const updated = await this.get(tenantId, enrollmentId);
      if (!updated) {
        throw new Error(`MFA enrollment ${enrollmentId} not found`);
      }
      return updated;
    },

    async remove(tenantId: string, enrollmentId: string): Promise<boolean> {
      return deleteItem(
        ctx,
        mfaEnrollmentKeys.pk(tenantId),
        mfaEnrollmentKeys.sk(enrollmentId),
      );
    },
  };
}
