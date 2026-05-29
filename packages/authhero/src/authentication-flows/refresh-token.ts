import { JSONHTTPException } from "../errors/json-http-exception";
import { Context } from "hono";
import { Bindings, Variables, GrantFlowUserResult } from "../types";
import {
  AuthorizationResponseMode,
  LogTypes,
  RefreshToken,
} from "@authhero/adapter-interfaces";
import { z } from "@hono/zod-openapi";
import { safeCompare } from "../utils/safe-compare";
import { appendLog } from "../utils/append-log";
import { getEnrichedClient } from "../helpers/client";
import { ssrfFetchOptionsFromEnv } from "../utils/ssrf-fetch";
import { logMessage } from "../helpers/logging";
import {
  formatRefreshToken,
  generateRefreshTokenParts,
  hashRefreshTokenSecret,
  isLegacyRefreshTokenAccepted,
  parseRefreshToken,
} from "../utils/refresh-token-format";
import { ulid } from "../utils/ulid";
import { tryUpstreamRemint } from "./refresh-token-migration";

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
    ssrfFetchOptionsFromEnv(ctx.env),
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

  // Auth0 returns 403 for invalid_grant on the token endpoint; RFC 6749 §5.2
  // mandates 400. Gate on the client's auth0_conformant flag (default true).
  const invalidGrantStatus = client.auth0_conformant === false ? 400 : 403;

  // Resolve the row from either the new `rt_<lookup>.<secret>` format or the
  // legacy id-only format (back-compat window only).
  const parsed = parseRefreshToken(params.refresh_token);
  let refreshToken: RefreshToken | null = null;

  if (parsed.kind === "new") {
    const candidate = await ctx.env.data.refreshTokens.getByLookup(
      client.tenant.id,
      parsed.lookup,
    );
    if (candidate?.token_hash) {
      const presentedHash = await hashRefreshTokenSecret(parsed.secret);
      if (safeCompare(presentedHash, candidate.token_hash)) {
        refreshToken = candidate;
      }
    }
  } else if (isLegacyRefreshTokenAccepted()) {
    refreshToken = await ctx.env.data.refreshTokens.get(
      client.tenant.id,
      parsed.id,
    );
  }

  if (!refreshToken) {
    // No local row matches the presented token. Try the tenant's configured
    // migration sources (#833): redeem the RT upstream, learn the user via
    // /userinfo, then mint native authhero tokens. If no source accepts it,
    // fall through to `invalid_grant`.
    const reminted = await tryUpstreamRemint(ctx, client, params.refresh_token);
    if (reminted) {
      return reminted;
    }
    appendLog(ctx, "Invalid refresh token");
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN,
      description: "Invalid refresh token",
    });
    throw new JSONHTTPException(invalidGrantStatus, {
      error: "invalid_grant",
      error_description: "Invalid refresh token",
    });
  } else if (refreshToken.client_id !== client.client_id) {
    appendLog(
      ctx,
      `Refresh token client mismatch: token client=${refreshToken.client_id}, request client=${client.client_id}`,
    );
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN,
      description: "Refresh token was not issued to this client",
      userId: refreshToken.user_id,
    });
    throw new JSONHTTPException(invalidGrantStatus, {
      error: "invalid_grant",
      error_description: "Invalid grant",
    });
  } else if (refreshToken.revoked_at) {
    appendLog(ctx, `Refresh token has been revoked: ${refreshToken.id}`);
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN,
      description: "Refresh token has been revoked",
      userId: refreshToken.user_id,
    });
    throw new JSONHTTPException(invalidGrantStatus, {
      error: "invalid_grant",
      error_description: "Refresh token has been revoked",
    });
  } else if (
    (refreshToken.expires_at &&
      new Date(refreshToken.expires_at) < new Date()) ||
    (refreshToken.idle_expires_at &&
      new Date(refreshToken.idle_expires_at) < new Date())
  ) {
    appendLog(ctx, "Refresh token has expired");
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN,
      description: "Refresh token has expired",
      userId: refreshToken.user_id,
    });
    throw new JSONHTTPException(invalidGrantStatus, {
      error: "invalid_grant",
      error_description: "Refresh token has expired",
    });
  }

  // Reuse detection: if this row was previously rotated, decide whether the
  // re-presentation falls inside the configured leeway window.
  if (refreshToken.rotated_at) {
    const leewaySeconds = client.refresh_token?.leeway ?? 30;
    const rotatedAtMs = new Date(refreshToken.rotated_at).getTime();
    if (Date.now() - rotatedAtMs > leewaySeconds * 1000) {
      const familyId = refreshToken.family_id ?? refreshToken.id;
      await ctx.env.data.refreshTokens.revokeFamily(
        client.tenant.id,
        familyId,
        new Date().toISOString(),
      );
      appendLog(
        ctx,
        `Refresh token reuse detected; family ${familyId} revoked`,
      );
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN,
        description: "Refresh token reuse detected; family revoked",
        userId: refreshToken.user_id,
      });
      throw new JSONHTTPException(invalidGrantStatus, {
        error: "invalid_grant",
        error_description: "Refresh token has been revoked",
      });
    }
    // within leeway: fall through and mint another sibling child
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

  // Token rotation decision: rotate if either the stored row says so or, for
  // legacy rows that pre-date the rotating column being honored, the client
  // is configured to rotate.
  const clientRotates = client.refresh_token?.rotation_type === "rotating";
  const shouldRotate = refreshToken.rotating || clientRotates;

  const nextLastIp = ctx.req.header("x-real-ip") || "";
  const nextLastUa = ctx.req.header("user-agent") || "";
  const deviceChanged =
    nextLastIp !== refreshToken.device?.last_ip ||
    nextLastUa !== refreshToken.device?.last_user_agent;

  let outgoingWireToken: string | undefined = params.refresh_token;

  if (shouldRotate) {
    // Mint a fresh child row that inherits the parent's identity but gets a
    // new (lookup, secret) pair, refreshed sliding idle window, and the same
    // family id (anchored to the parent for legacy upgrades).
    const childId = ulid();
    const { lookup: childLookup, secret: childSecret } =
      generateRefreshTokenParts();
    const childHash = await hashRefreshTokenSecret(childSecret);
    const familyId = refreshToken.family_id ?? refreshToken.id;

    const newIdleExpiresAt =
      refreshToken.idle_expires_at && client.tenant.idle_session_lifetime
        ? new Date(
            Date.now() + client.tenant.idle_session_lifetime * 60 * 60 * 1000,
          ).toISOString()
        : refreshToken.idle_expires_at;

    await ctx.env.data.refreshTokens.create(client.tenant.id, {
      id: childId,
      login_id: refreshToken.login_id,
      user_id: refreshToken.user_id,
      client_id: refreshToken.client_id,
      // Absolute expiry never extends across rotation — the family stays
      // bounded by the original session_lifetime.
      expires_at: refreshToken.expires_at,
      idle_expires_at: newIdleExpiresAt,
      device: {
        ...refreshToken.device,
        last_ip: nextLastIp,
        last_user_agent: nextLastUa,
      },
      resource_servers: refreshToken.resource_servers,
      rotating: true,
      token_lookup: childLookup,
      token_hash: childHash,
      family_id: familyId,
    });

    // Anchor `rotated_at` to the *first* rotation so leeway-window siblings
    // don't extend the parent's exposure. Always overwrite `rotated_to` to
    // the most recent child for traceability. Also stamp `family_id` on the
    // parent — for legacy rows (created before the rotation columns
    // existed) this is the first time `family_id` gets a value, and
    // without it `revokeFamily` would skip the parent itself when reuse is
    // detected later.
    await ctx.env.data.refreshTokens.update(client.tenant.id, refreshToken.id, {
      rotated_to: childId,
      rotated_at: refreshToken.rotated_at ?? new Date().toISOString(),
      family_id: familyId,
    });

    outgoingWireToken = formatRefreshToken(childLookup, childSecret);
  } else if (
    refreshToken.idle_expires_at &&
    client.tenant.idle_session_lifetime
  ) {
    // Non-rotating path: slide the parent's idle window forward and let the
    // client keep using the same wire token they sent.
    const idleExpiresAt = new Date(
      Date.now() + client.tenant.idle_session_lifetime * 60 * 60 * 1000,
    );

    const absoluteExpiryMs = refreshToken.expires_at
      ? new Date(refreshToken.expires_at).getTime()
      : 0;
    const newLoginSessionExpiryMs = Math.max(
      absoluteExpiryMs,
      idleExpiresAt.getTime(),
    );

    await ctx.env.data.refreshTokens.update(
      client.tenant.id,
      refreshToken.id,
      {
        idle_expires_at: idleExpiresAt.toISOString(),
        last_exchanged_at: new Date().toISOString(),
        ...(deviceChanged && {
          device: {
            ...refreshToken.device,
            last_ip: nextLastIp,
            last_user_agent: nextLastUa,
          },
        }),
      },
      refreshToken.login_id && newLoginSessionExpiryMs > 0
        ? {
            loginSessionBump: {
              login_id: refreshToken.login_id,
              expires_at: new Date(newLoginSessionExpiryMs).toISOString(),
            },
          }
        : undefined,
    );
  }

  return {
    user,
    client,
    refresh_token: outgoingWireToken,
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
