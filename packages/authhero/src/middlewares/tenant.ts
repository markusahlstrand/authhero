import { Context, Next } from "hono";
import { Bindings, Variables } from "../types";

/**
 * Sets the tenant id in the context based on the url and headers
 * @param ctx
 * @param next
 * @returns
 */
export async function tenantMiddleware(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next,
) {
  const xForwardedHost = ctx.req.header("x-forwarded-host");

  if (xForwardedHost) {
    const domain = await ctx.env.data.customDomains.getByDomain(xForwardedHost);

    if (domain) {
      ctx.set("tenant_id", domain.tenant_id);
    }
  }

  return await next();
}
