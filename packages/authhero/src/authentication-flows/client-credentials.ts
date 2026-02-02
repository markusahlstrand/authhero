import { JSONHTTPException } from "../errors/json-http-exception";
import { Context } from "hono";
import { AuthParams } from "@authhero/adapter-interfaces";
import { z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../types";
import { safeCompare } from "../utils/safe-compare";
import { GrantFlowResult } from "../types/GrantFlowResult";
import { getEnrichedClient } from "../helpers/client";

export const clientCredentialGrantParamsSchema = z.object({
  grant_type: z.literal("client_credentials"),
  scope: z.string().optional(),
  client_secret: z.string(),
  client_id: z.string(),
  audience: z.string().optional(),
  organization: z.string().optional(),
});

export async function clientCredentialsGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: z.infer<typeof clientCredentialGrantParamsSchema>,
): Promise<GrantFlowResult> {
  const client = await getEnrichedClient(
    ctx.env,
    params.client_id,
    ctx.var.tenant_id,
  );

  if (
    client.client_secret &&
    !safeCompare(client.client_secret, params.client_secret)
  ) {
    throw new JSONHTTPException(403, { message: "Invalid client credentials" });
  }

  // Fetch organization if organization ID is provided
  let organization: { id: string; name: string } | undefined;
  if (params.organization) {
    const org = await ctx.env.data.organizations.get(
      client.tenant.id,
      params.organization,
    );
    if (!org) {
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description: `Organization '${params.organization}' not found`,
      });
    }
    organization = { id: org.id, name: org.name };
  }

  const authParams: AuthParams = {
    client_id: client.client_id,
    scope: params.scope,
    audience: params.audience || client.tenant.default_audience,
    organization: params.organization,
  };

  return {
    client,
    authParams,
    organization,
  };
}
