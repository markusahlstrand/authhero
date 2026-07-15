import { z } from "@hono/zod-openapi";
import { tenantInvitationInputSchema } from "./types";

/**
 * The HTTP contract shared by the control-plane `tenant-members` resource
 * (`createTenantMembersControlPlaneApp`) and the remote client that calls it
 * (`createControlPlaneTenantMembersAdapter`). Keeping the paths and body shapes
 * in one place is what keeps the two ends from drifting.
 */
export const CONTROL_PLANE_TENANT_MEMBERS_PATH =
  "/api/v2/proxy/control-plane/tenant-members";

/**
 * `tenant_id` rides on every write body for wire readability, but the server
 * NEVER acts on it: the tenant is taken from the verified token and a mismatch
 * is refused (same rule as the custom-domains resource). A shard holding the
 * scope must not touch another tenant's team by naming it.
 */
const tenantIdField = { tenant_id: z.string().optional() };

export const membersMutationBodySchema = z.object({
  ...tenantIdField,
  user_ids: z.array(z.string()).min(1),
});

export const memberRolesBodySchema = z.object({
  ...tenantIdField,
  roles: z.array(z.string()).min(1),
});

export const createInvitationBodySchema =
  tenantInvitationInputSchema.extend(tenantIdField);
