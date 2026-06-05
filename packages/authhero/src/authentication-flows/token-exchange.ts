import { Context } from "hono";
import { z } from "@hono/zod-openapi";
import { AuthParams, LogTypes } from "@authhero/adapter-interfaces";
import { JSONHTTPException } from "../errors/json-http-exception";
import { Bindings, Variables, GrantFlowUserResult } from "../types";
import { safeCompare } from "../utils/safe-compare";
import { getEnrichedClient } from "../helpers/client";
import { logMessage } from "../helpers/logging";
import { validateJwtToken } from "../utils/jwt";
import { getIssuer } from "../variables";

const SUBJECT_TOKEN_TYPE_ACCESS_TOKEN =
  "urn:ietf:params:oauth:token-type:access_token";

export const TOKEN_EXCHANGE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:token-exchange";

export const tokenExchangeParamsSchema = z.object({
  grant_type: z.literal(TOKEN_EXCHANGE_GRANT_TYPE),
  client_id: z.string(),
  client_secret: z.string().optional(),
  subject_token: z.string(),
  // Only self-issued access tokens are accepted today. Foreign token types
  // would require a per-tenant registration flow (Auth0-style "Custom Token
  // Exchange profile") — out of scope for this slice.
  subject_token_type: z.literal(SUBJECT_TOKEN_TYPE_ACCESS_TOKEN),
  // Required: the org context to switch into. The exchanging client must be
  // registered with `organization_usage` != "deny" (default is "deny").
  organization: z.string().min(1),
  // Optional: if omitted, the new token reuses the subject token's `aud`.
  audience: z.string().optional(),
  // Optional: requested scopes. If omitted, the subject token's scope set is
  // reused. Cannot exceed the subject token's scopes (downscope only).
  scope: z.string().optional(),
});

export type TokenExchangeParams = z.infer<typeof tokenExchangeParamsSchema>;

export async function tokenExchangeGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: TokenExchangeParams,
): Promise<GrantFlowUserResult> {
  const client = await getEnrichedClient(
    ctx.env,
    params.client_id,
    ctx.var.tenant_id,
  );

  const failLog = (description: string) =>
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_SUBJECT_TOKEN_FOR_ACCESS_TOKEN,
      description,
    });

  // RFC 6749 §2.3: the exchanging client must authenticate. Token exchange
  // is a confidential-client operation — anonymous public clients must not be
  // able to mint tenant-scoped tokens from arbitrary subject tokens.
  const authenticatedViaAssertion =
    ctx.var.client_authenticated_via_assertion === true;

  if (!authenticatedViaAssertion) {
    if (!params.client_secret) {
      failLog("Missing client_secret");
      throw new JSONHTTPException(401, {
        error: "invalid_client",
        error_description: "client_secret is required",
      });
    }
    if (
      !client.client_secret ||
      !safeCompare(client.client_secret, params.client_secret)
    ) {
      failLog("Invalid client credentials");
      throw new JSONHTTPException(401, {
        error: "invalid_client",
        error_description: "Client authentication failed",
      });
    }
  }

  // Gate on the exchanging client's organization_usage. Defaults to "deny",
  // so freshly registered (DCR'd) clients can't perform token exchange until
  // an admin explicitly flips them to "allow" or "require".
  if (
    !client.organization_usage ||
    client.organization_usage === "deny"
  ) {
    failLog("Client is not permitted to request organization context");
    throw new JSONHTTPException(403, {
      error: "unauthorized_client",
      error_description:
        "Client is not configured to request organization context",
    });
  }

  // Verify the subject token: signature + issuer + expiry. validateJwtToken
  // resolves the signing key from the tenant's own JWKS, so any token it
  // accepts was issued by this authhero instance.
  const subjectPayload = await validateJwtToken(ctx, params.subject_token);

  // Auth0 returns 403 for invalid_grant on the token endpoint; RFC 6749 §5.2
  // mandates 400. Gate on the client's auth0_conformant flag (default true) —
  // mirrors the pattern in refresh-token.ts so all grants agree.
  const invalidGrantStatus = client.auth0_conformant === false ? 400 : 403;

  const expectedIssuer = getIssuer(ctx.env, ctx.var.custom_domain);
  if (subjectPayload.iss !== expectedIssuer) {
    failLog("Subject token was not issued by this server");
    throw new JSONHTTPException(invalidGrantStatus, {
      error: "invalid_grant",
      error_description: "Subject token issuer mismatch",
    });
  }

  if (
    typeof subjectPayload.exp === "number" &&
    subjectPayload.exp * 1000 < Date.now()
  ) {
    failLog("Subject token expired");
    throw new JSONHTTPException(invalidGrantStatus, {
      error: "invalid_grant",
      error_description: "Subject token has expired",
    });
  }

  // Refuse to re-exchange tokens that already carry an `act` claim — RFC 8693
  // allows nested actors, but per design we don't issue chainable exchange
  // tokens. Prevents privilege amplification by repeated exchanges.
  if (subjectPayload.act !== undefined) {
    failLog("Subject token already represents a delegated session");
    throw new JSONHTTPException(invalidGrantStatus, {
      error: "invalid_grant",
      error_description: "Subject token is not exchangeable",
    });
  }

  if (!subjectPayload.sub) {
    failLog("Subject token missing sub");
    throw new JSONHTTPException(invalidGrantStatus, {
      error: "invalid_grant",
      error_description: "Subject token has no subject",
    });
  }

  const tokenUser = await ctx.env.data.users.get(
    client.tenant.id,
    subjectPayload.sub,
  );
  if (!tokenUser) {
    failLog("User not found");
    throw new JSONHTTPException(invalidGrantStatus, {
      error: "invalid_grant",
      error_description: "Subject token subject is not a known user",
    });
  }
  const user = tokenUser.linked_to
    ? await ctx.env.data.users.get(client.tenant.id, tokenUser.linked_to)
    : tokenUser;
  if (!user) {
    failLog("Linked user not found");
    throw new JSONHTTPException(invalidGrantStatus, {
      error: "invalid_grant",
      error_description: "Subject token subject is not a known user",
    });
  }

  ctx.set("user_id", user.user_id);

  // Look up the target organization.
  const org = await ctx.env.data.organizations.get(
    client.tenant.id,
    params.organization,
  );
  if (!org) {
    failLog(`Organization '${params.organization}' not found`);
    throw new JSONHTTPException(400, {
      error: "invalid_request",
      error_description: `Organization '${params.organization}' not found`,
    });
  }
  const organization = { id: org.id, name: org.name };

  // Resolve the target audience. Defaults to the subject token's audience —
  // for the typical authhero shape (one inherited resource server per
  // tenant), this means the only thing changing is `org_id`.
  // If the subject token carries multiple audiences and the caller didn't
  // disambiguate via params.audience, refuse — silently picking aud[0] could
  // mint a token for the wrong resource server.
  if (
    params.audience === undefined &&
    Array.isArray(subjectPayload.aud) &&
    subjectPayload.aud.length > 1
  ) {
    failLog("Subject token has multiple audiences and none was requested");
    throw new JSONHTTPException(400, {
      error: "invalid_request",
      error_description:
        "audience is required when subject token has multiple audiences",
    });
  }
  const requestedAudience =
    params.audience ??
    (typeof subjectPayload.aud === "string"
      ? subjectPayload.aud
      : Array.isArray(subjectPayload.aud)
        ? subjectPayload.aud[0]
        : undefined);
  if (!requestedAudience) {
    failLog("No audience on subject token and none requested");
    throw new JSONHTTPException(400, {
      error: "invalid_request",
      error_description: "audience is required when subject token has none",
    });
  }

  const resourceServers = await ctx.env.data.resourceServers.list(
    client.tenant.id,
  );
  const resourceServer = resourceServers.resource_servers.find(
    (rs) => rs.identifier === requestedAudience,
  );
  if (!resourceServer) {
    failLog(`Audience '${requestedAudience}' is not a registered resource server`);
    throw new JSONHTTPException(400, {
      error: "invalid_request",
      error_description: "audience is not a registered resource server",
    });
  }

  // Authorize the org switch. Mirrors the refresh-token grant: bypass when
  // the user has the global `admin:organizations` permission on this
  // resource server (gated by tenant flag); otherwise require membership.
  let hasGlobalOrgAdminPermission = false;
  const tenant = await ctx.env.data.tenants.get(client.tenant.id);
  if (tenant?.flags?.inherit_global_permissions_in_organizations) {
    const globalUserPermissions = await ctx.env.data.userPermissions.list(
      client.tenant.id,
      user.user_id,
      undefined,
      "", // tenant-level (global) permissions
    );
    hasGlobalOrgAdminPermission = globalUserPermissions.some(
      (p) =>
        p.permission_name === "admin:organizations" &&
        p.resource_server_identifier === resourceServer.identifier,
    );

    if (!hasGlobalOrgAdminPermission) {
      const globalRoles = await ctx.env.data.userRoles.list(
        client.tenant.id,
        user.user_id,
        undefined,
        "",
      );
      for (const role of globalRoles) {
        const rolePermissions = await ctx.env.data.rolePermissions.list(
          client.tenant.id,
          role.id,
          { per_page: 1000 },
        );
        const hasAdminOrg = rolePermissions.some(
          (p) =>
            p.permission_name === "admin:organizations" &&
            p.resource_server_identifier === resourceServer.identifier,
        );
        if (hasAdminOrg) {
          hasGlobalOrgAdminPermission = true;
          break;
        }
      }
    }
  }

  if (!hasGlobalOrgAdminPermission) {
    const userOrgs = await ctx.env.data.userOrganizations.list(
      client.tenant.id,
      { q: `user_id:${user.user_id}`, per_page: 1000 },
    );
    const isMember = userOrgs.userOrganizations.some(
      (uo) => uo.organization_id === organization.id,
    );
    if (!isMember) {
      failLog(
        `User ${user.user_id} is not a member of organization ${organization.id}`,
      );
      throw new JSONHTTPException(403, {
        error: "access_denied",
        error_description:
          "User is not a member of the specified organization",
      });
    }
  }

  // Downscope: requested scopes must be a subset of the subject token's.
  const subjectScopes = (subjectPayload.scope ?? "").split(" ").filter(Boolean);
  const requestedScopes = params.scope?.split(" ").filter(Boolean);
  let finalScope: string | undefined;
  if (requestedScopes && requestedScopes.length > 0) {
    const excess = requestedScopes.filter((s) => !subjectScopes.includes(s));
    if (excess.length > 0) {
      failLog(`Requested scope exceeds subject token: ${excess.join(",")}`);
      throw new JSONHTTPException(400, {
        error: "invalid_scope",
        error_description: "Requested scope exceeds subject token scope",
      });
    }
    finalScope = requestedScopes.join(" ");
  } else {
    finalScope = subjectScopes.join(" ") || undefined;
  }

  const authParams: AuthParams = {
    client_id: client.client_id,
    audience: requestedAudience,
    scope: finalScope,
    organization: organization.id,
  };

  return {
    user,
    client,
    authParams,
    organization,
    // Stamp the exchanging client as the actor on the new token.
    actClient: { client_id: client.client_id },
  };
}
