import { JSONHTTPException } from "../errors/json-http-exception";
import { Context } from "hono";
import { Bindings, Variables, GrantFlowUserResult } from "../types";
import {
  AuthorizationResponseMode,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { z } from "@hono/zod-openapi";
import { safeCompare } from "../utils/safe-compare";
import { appendLog } from "../utils/append-log";
import { getEnrichedClient } from "../helpers/client";
import { logMessage } from "../helpers/logging";

export const refreshTokenParamsSchema = z.object({
  grant_type: z.literal("refresh_token"),
  client_id: z.string(),
  redirect_uri: z.string().optional(),
  refresh_token: z.string(),
  client_secret: z.string().optional(),
  organization: z.string().min(1).optional(),
});

export async function refreshTokenGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: z.infer<typeof refreshTokenParamsSchema>,
): Promise<GrantFlowUserResult> {
  const client = await getEnrichedClient(
    ctx.env,
    params.client_id,
    ctx.var.tenant_id,
  );

  // Validate client_secret if provided
  if (params.client_secret) {
    if (
      client.client_secret &&
      !safeCompare(client.client_secret, params.client_secret)
    ) {
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN,
        description: "Client authentication failed",
      });
      throw new JSONHTTPException(403, {
        error: "invalid_client",
        error_description: "Client authentication failed",
      });
    }
  }

  const refreshToken = await ctx.env.data.refreshTokens.get(
    client.tenant.id,
    params.refresh_token,
  );

  if (!refreshToken) {
    appendLog(ctx, `Invalid refresh token: ${params.refresh_token}`);
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN,
      description: "Invalid refresh token",
    });
    throw new JSONHTTPException(400, {
      error: "invalid_grant",
      error_description: "Invalid refresh token",
    });
  } else if (refreshToken.revoked_at) {
    appendLog(ctx, `Refresh token has been revoked: ${refreshToken.id}`);
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN,
      description: "Refresh token has been revoked",
      userId: refreshToken.user_id,
    });
    throw new JSONHTTPException(400, {
      error: "invalid_grant",
      error_description: "Refresh token has been revoked",
    });
  } else if (
    (refreshToken.expires_at &&
      new Date(refreshToken.expires_at) < new Date()) ||
    (refreshToken.idle_expires_at &&
      new Date(refreshToken.idle_expires_at) < new Date())
  ) {
    appendLog(ctx, `Refresh token has expired: ${params.refresh_token}`);
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN,
      description: "Refresh token has expired",
      userId: refreshToken.user_id,
    });
    throw new JSONHTTPException(400, {
      error: "invalid_grant",
      error_description: "Refresh token has expired",
    });
  }

  const tokenUser = await ctx.env.data.users.get(
    client.tenant.id,
    refreshToken.user_id,
  );
  if (!tokenUser) {
    throw new JSONHTTPException(403, { message: "User not found" });
  }

  const user = tokenUser.linked_to
    ? await ctx.env.data.users.get(client.tenant.id, tokenUser.linked_to)
    : tokenUser;
  if (!user) {
    throw new JSONHTTPException(403, { message: "User not found" });
  }

  ctx.set("user_id", user.user_id);

  const resourceServer = refreshToken.resource_servers[0];

  // Resolve session_id and login session data
  let sessionId: string | undefined;
  let loginSession;
  if (refreshToken.login_id) {
    loginSession = await ctx.env.data.loginSessions.get(
      client.tenant.id,
      refreshToken.login_id,
    );
    sessionId = loginSession?.session_id;
  }

  // Resolve organization: explicit param takes priority, then fall back to login session
  const effectiveOrganization =
    params.organization ?? loginSession?.authParams.organization;

  let organization: { id: string; name: string } | undefined;
  if (effectiveOrganization) {
    const orgData = await ctx.env.data.organizations.get(
      client.tenant.id,
      effectiveOrganization,
    );
    if (orgData) {
      organization = { id: orgData.id, name: orgData.name };
    } else {
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description: `Organization '${effectiveOrganization}' not found`,
      });
    }

    // Check if user has global admin:organizations permission (bypasses membership check)
    let hasGlobalOrgAdminPermission = false;
    const currentTenant = await ctx.env.data.tenants.get(client.tenant.id);

    if (
      currentTenant?.flags?.inherit_global_permissions_in_organizations &&
      resourceServer?.audience
    ) {
      // Check direct user permissions at tenant level
      const globalUserPermissions = await ctx.env.data.userPermissions.list(
        client.tenant.id,
        user.user_id,
        undefined,
        "", // Empty string for tenant-level (global) permissions
      );

      hasGlobalOrgAdminPermission = globalUserPermissions.some(
        (permission) =>
          permission.permission_name === "admin:organizations" &&
          permission.resource_server_identifier === resourceServer.audience,
      );

      // Check role-derived permissions at tenant level
      if (!hasGlobalOrgAdminPermission) {
        const globalRoles = await ctx.env.data.userRoles.list(
          client.tenant.id,
          user.user_id,
          undefined,
          "", // Empty string for tenant-level (global) roles
        );

        for (const role of globalRoles) {
          const rolePermissions = await ctx.env.data.rolePermissions.list(
            client.tenant.id,
            role.id,
            { per_page: 1000 },
          );

          const hasAdminOrg = rolePermissions.some(
            (permission) =>
              permission.permission_name === "admin:organizations" &&
              permission.resource_server_identifier === resourceServer.audience,
          );

          if (hasAdminOrg) {
            hasGlobalOrgAdminPermission = true;
            break;
          }
        }
      }
    }

    // Verify the user is a member of the organization (unless they have global admin permission)
    if (!hasGlobalOrgAdminPermission) {
      const userOrgs = await ctx.env.data.userOrganizations.list(
        client.tenant.id,
        {
          q: `user_id:${user.user_id}`,
          per_page: 1000,
        },
      );

      const isMember = userOrgs.userOrganizations.some(
        (uo) => uo.organization_id === organization!.id,
      );

      if (!isMember) {
        throw new JSONHTTPException(403, {
          error: "access_denied",
          error_description:
            "User is not a member of the specified organization",
        });
      }
    }
  }

  // Update the idle_expires_at using tenant settings
  if (refreshToken.idle_expires_at && client.tenant.idle_session_lifetime) {
    const idleExpiresAt = new Date(
      Date.now() + client.tenant.idle_session_lifetime * 60 * 60 * 1000,
    );
    // The refreshTokens adapter also bumps the parent login_session's
    // expires_at_ts in the same transaction.
    await ctx.env.data.refreshTokens.update(client.tenant.id, refreshToken.id, {
      idle_expires_at: idleExpiresAt.toISOString(),
      last_exchanged_at: new Date().toISOString(),
      device: {
        ...refreshToken.device,
        last_ip: ctx.req.header["x-real-ip"] || "",
        last_user_agent: ctx.req.header["user-agent"] || "",
      },
    });
  }

  return {
    user,
    client,
    refresh_token: refreshToken.id,
    session_id: sessionId,
    login_id: refreshToken.login_id,
    organization,
    authParams: {
      client_id: client.client_id,
      audience: resourceServer?.audience,
      scope: resourceServer?.scopes,
      response_mode: AuthorizationResponseMode.WEB_MESSAGE,
    },
  };
}
