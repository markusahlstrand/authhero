import { JSONHTTPException } from "../errors/json-http-exception";
import { Context } from "hono";
import { AuthParams, LogTypes } from "@authhero/adapter-interfaces";
import { z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../types";
import { safeCompare } from "../utils/safe-compare";
import { GrantFlowResult } from "../types/GrantFlowResult";
import { getEnrichedClient, EnrichedClient } from "../helpers/client";
import { logMessage } from "../helpers/logging";

export const clientCredentialGrantParamsSchema = z.object({
  grant_type: z.literal("client_credentials"),
  scope: z.string().optional(),
  // Optional: when authenticated via RFC 7523 client_assertion the secret is
  // not present on the request. The /oauth/token handler enforces that *some*
  // form of client authentication ran before this point.
  client_secret: z.string().optional(),
  client_id: z.string(),
  audience: z.string().optional(),
  organization: z.string().optional(),
});

export async function clientCredentialsGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: z.infer<typeof clientCredentialGrantParamsSchema>,
  preloadedClient?: EnrichedClient,
): Promise<GrantFlowResult> {
  const client =
    preloadedClient ??
    (await getEnrichedClient(ctx.env, params.client_id, ctx.var.tenant_id));

  const authenticatedViaAssertion =
    ctx.var.client_authenticated_via_assertion === true;

  if (!authenticatedViaAssertion) {
    if (!params.client_secret) {
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_EXCHANGE_ACCESS_TOKEN_FOR_CLIENT_CREDENTIALS,
        description: "Missing client_secret",
      });
      throw new JSONHTTPException(401, {
        message: "client_secret is required",
      });
    }
    if (!client.client_secret) {
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_EXCHANGE_ACCESS_TOKEN_FOR_CLIENT_CREDENTIALS,
        description: "Client has no registered secret",
      });
      throw new JSONHTTPException(401, {
        message: "Client authentication failed",
      });
    }
    if (!safeCompare(client.client_secret, params.client_secret)) {
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_EXCHANGE_ACCESS_TOKEN_FOR_CLIENT_CREDENTIALS,
        description: "Invalid client credentials",
      });
      throw new JSONHTTPException(403, {
        message: "Invalid client credentials",
      });
    }
  }

  // Fetch organization if organization ID is provided
  let organization: { id: string; name: string } | undefined;
  if (params.organization) {
    const org = await ctx.env.data.organizations.get(
      client.tenant.id,
      params.organization,
    );
    if (!org) {
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_EXCHANGE_ACCESS_TOKEN_FOR_CLIENT_CREDENTIALS,
        description: `Organization '${params.organization}' not found`,
      });
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
