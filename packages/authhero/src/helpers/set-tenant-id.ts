import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { HTTPException } from "hono/http-exception";

/**
 * Sets the tenant_id in context if not already set.
 * If tenant_id is already set, validates it matches the expected tenant.
 * Throws if there's a mismatch to prevent cross-tenant attacks.
 *
 * @param ctx - Hono context
 * @param tenantId - The expected tenant ID (e.g., from a client lookup)
 * @throws HTTPException if tenant_id is already set and doesn't match
 */
export function setTenantId(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
): void {
  const existingTenantId = ctx.var.tenant_id;

  if (!existingTenantId) {
    // No tenant set yet, set it now
    ctx.set("tenant_id", tenantId);
    return;
  }

  if (existingTenantId !== tenantId) {
    // Tenant mismatch - this could be a cross-tenant attack attempt
    throw new HTTPException(403, {
      message: "Tenant mismatch",
    });
  }

  // Tenant already set and matches, nothing to do
}
