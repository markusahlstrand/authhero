import { JSONHTTPException } from "../errors/json-http-exception";
import { Context } from "hono";
import { Bindings, Variables, GrantFlowUserResult } from "../types";
import {
  AuthorizationResponseMode,
  LogTypes,
  RefreshToken,
  escapeLuceneValue,
} from "@authhero/adapter-interfaces";
import { z } from "@hono/zod-openapi";
import { safeCompare } from "../utils/safe-compare";
import { appendLog } from "../utils/append-log";
import { getEnrichedClient, EnrichedClient } from "../helpers/client";
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
import { userHasGlobalOrgAdminPermission } from "../helpers/scopes-permissions";
import { touchSessionUsedAt } from "../helpers/session-usage";
import { resolvePrimaryUser } from "../helpers/users";
import {
  resolveAbsoluteRefreshTokenLifetime,
  resolveExchangeExpiryUpdate,
  slideIdleExpiry,
} from "../helpers/refresh-token-lifetime";

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
  preloadedClient?: EnrichedClient,
): Promise<GrantFlowUserResult> {
  const client =
    preloadedClient ??
    (await getEnrichedClient(
      ctx.env,
      params.client_id,
      ctx.var.tenant_id,
      ssrfFetchOptionsFromEnv(ctx.env),
    ));

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

  // The failure logs below fire before the login-session/user lookup further
  // down, so on their own they'd omit the audience/scope/connection/strategy
  // that the success log (token.ts) records — leaving a failed exchange less
  // traceable than a successful one. Resolve those same fields from the token
  // row (audience/scope) and the login session it was minted against
  // (connection/strategy). Only the single failing branch runs, so this costs
  // at most one extra keyed read, and only on the error path.
  const resolveFailureLogFields = async () => {
    if (!refreshToken) return {};
    const resourceServer = refreshToken.resource_servers[0];
    // A token carrying its own facts needs no read at all — the error path
    // gets cheaper as well as more reliable, since a cleaned-up login session
    // no longer costs the failure log its connection/strategy fields.
    const loginSession =
      refreshToken.login_id && !refreshToken.session_id
        ? await ctx.env.data.loginSessions.get(
            client.tenant.id,
            refreshToken.login_id,
          )
        : undefined;
    return {
      userId: refreshToken.user_id,
      audience: resourceServer?.audience,
      scope: resourceServer?.scopes,
      connection: refreshToken.auth_connection ?? loginSession?.auth_connection,
      strategy:
        refreshToken.auth_strategy?.strategy ??
        loginSession?.auth_strategy?.strategy,
      strategy_type:
        refreshToken.auth_strategy?.strategy_type ??
        loginSession?.auth_strategy?.strategy_type,
    };
  };

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
      ...(await resolveFailureLogFields()),
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
      ...(await resolveFailureLogFields()),
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
      ...(await resolveFailureLogFields()),
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
        ...(await resolveFailureLogFields()),
      });
      throw new JSONHTTPException(invalidGrantStatus, {
        error: "invalid_grant",
        error_description: "Refresh token has been revoked",
      });
    }
    // within leeway: fall through and mint another sibling child
  }

  // Tokens minted from stage 2 of #1255 onward carry their own auth-event
  // facts, so the login session is only consulted for older rows. `session_id`
  // is the marker: it is always set at mint for a token issued under a
  // session, so its absence means the row predates the columns. The other
  // facts are genuinely optional and cannot be used to tell "not stored" from
  // "not applicable".
  //
  // This is deliberately conservative — a legacy row still does exactly what
  // it does today, including degrading to `undefined` if its login session has
  // already been cleaned up. What it cannot do any more is degrade silently
  // for a token minted after the migration.
  const hasDenormalisedFacts = !!refreshToken.session_id;

  // The user lookup and the login-session lookup are independent — the login
  // session is keyed on refreshToken.login_id, which we already have. Fire
  // them together so the two backend round-trips overlap instead of stacking.
  const [tokenUser, loginSession] = await Promise.all([
    ctx.env.data.users.get(client.tenant.id, refreshToken.user_id),
    refreshToken.login_id && !hasDenormalisedFacts
      ? ctx.env.data.loginSessions.get(client.tenant.id, refreshToken.login_id)
      : Promise.resolve(undefined),
  ]);
  if (!tokenUser) {
    throw new JSONHTTPException(403, { message: "User not found" });
  }

  // Resolve to the cluster *root*, not one hop: a token whose `sub` names a
  // mid-chain identity reads downstream as a different person (issue #1250).
  const user = await resolvePrimaryUser(
    ctx.env.data.users,
    client.tenant.id,
    tokenUser,
  );
  // Still linked after resolving means the chain never reached a root —
  // dangling, cyclic, or deeper than the cap. Refuse rather than mint a token
  // for a non-canonical identity.
  if (user.linked_to) {
    throw new JSONHTTPException(403, { message: "User not found" });
  }

  ctx.set("user_id", user.user_id);

  // A blocked user cannot refresh tokens. `invalid_grant` is the correct OAuth
  // error for the token endpoint (mirrors the revoked-token responses above).
  if (user.blocked) {
    throw new JSONHTTPException(invalidGrantStatus, {
      error: "invalid_grant",
      error_description: "User is blocked",
    });
  }

  const resourceServer = refreshToken.resource_servers[0];

  // Prefer the token's own column; fall back to the login session for rows
  // minted before it existed.
  const sessionId: string | undefined =
    refreshToken.session_id ?? loginSession?.session_id;

  // Resolve organization: explicit param takes priority, then the token's own
  // column, then the login session.
  const effectiveOrganization =
    params.organization ??
    refreshToken.organization ??
    loginSession?.authParams.organization;

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

    // Check if user has the global `admin:organizations` permission, which
    // bypasses the membership check. This is a management-plane permission, so
    // it is always matched against the Management API audience — never against
    // the requested token's audience (which may be an app resource server).
    // Shared with the scopes-permissions gate so both stay in parity (#1198).
    let hasGlobalOrgAdminPermission = false;
    const currentTenant = await ctx.env.data.tenants.get(client.tenant.id);

    if (currentTenant?.flags?.inherit_global_permissions_in_organizations) {
      hasGlobalOrgAdminPermission = await userHasGlobalOrgAdminPermission(
        ctx,
        client.tenant.id,
        user.user_id,
      );
    }

    // Verify the user is a member of the organization (unless they have global admin permission)
    if (!hasGlobalOrgAdminPermission) {
      const userOrgs = await ctx.env.data.userOrganizations.list(
        client.tenant.id,
        {
          q: `user_id:${escapeLuceneValue(user.user_id)}`,
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

    const newIdleExpiresAt = slideIdleExpiry(
      client,
      refreshToken.idle_expires_at,
    );

    // Order matters across these two writes: create the child first, then
    // mark the parent rotated. If they ran concurrently and the parent update
    // landed while the child insert failed, the parent would be stamped
    // `rotated_at` with no child ever handed out — a later retry of the parent
    // (outside the leeway window) would then trip reuse detection and revoke
    // the whole family. Sequencing create→update means the parent is only ever
    // marked rotated after the child durably exists; the reverse failure
    // (child created, parent update fails) is benign — the grant rejects, the
    // orphan child is never handed out, and the client safely retries.
    await ctx.env.data.refreshTokens.create(client.tenant.id, {
      id: childId,
      login_id: refreshToken.login_id,
      // Rotation mints a new row for the same authentication event, so the
      // ownership edge and the auth-event facts carry over. These use the
      // values resolved above rather than the parent's columns directly: a
      // legacy parent has none, but its login session may still be alive, and
      // copying the raw undefined would mint a child that is legacy too —
      // leaving the family permanently unreachable by a session-keyed revoke.
      // Rotating a legacy token while its parent survives heals it instead.
      session_id: sessionId,
      organization: effectiveOrganization,
      auth_connection:
        refreshToken.auth_connection ?? loginSession?.auth_connection,
      auth_strategy: refreshToken.auth_strategy ?? loginSession?.auth_strategy,
      user_id: refreshToken.user_id,
      client_id: refreshToken.client_id,
      // Absolute expiry never extends across rotation — the family stays
      // bounded by the expiry stamped at mint. The one exception is a client
      // explicitly configured never to expire (`infinite_token_lifetime` /
      // `expiration_type: "non-expiring"`): honour that on the next rotation
      // instead of leaving rows minted under the old config bounded forever.
      expires_at:
        resolveAbsoluteRefreshTokenLifetime(client).kind === "infinite"
          ? undefined
          : refreshToken.expires_at,
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
    // parent — for legacy rows (created before the rotation columns existed)
    // this is the first time `family_id` gets a value, and without it
    // `revokeFamily` would skip the parent itself when reuse is detected later.
    await ctx.env.data.refreshTokens.update(client.tenant.id, refreshToken.id, {
      rotated_to: childId,
      rotated_at: refreshToken.rotated_at ?? new Date().toISOString(),
      family_id: familyId,
    });

    outgoingWireToken = formatRefreshToken(childLookup, childSecret);
  } else {
    // Non-rotating path: keep the client on the same row but slide its idle
    // window forward. Legacy rows (token_lookup unset because they pre-date
    // the rotation migration) get a one-time in-place upgrade: mint a fresh
    // (lookup, secret) pair, stamp the row, and hand the client the new
    // wire format. After this they never hit the legacy parser again.
    // Concurrent refreshes on the same legacy token race on the upgrade;
    // the loser's wire token won't match the persisted hash, so its next
    // refresh fails and the user re-authenticates. Acceptable for a
    // one-time migration.
    let upgrade:
      | { token_lookup: string; token_hash: string; family_id: string }
      | undefined;
    if (!refreshToken.token_lookup) {
      const { lookup, secret } = generateRefreshTokenParts();
      upgrade = {
        token_lookup: lookup,
        token_hash: await hashRefreshTokenSecret(secret),
        family_id: refreshToken.family_id ?? refreshToken.id,
      };
      outgoingWireToken = formatRefreshToken(lookup, secret);
    }

    // Reconcile the row against the client's current refresh-token lifetimes
    // (#1260): slide the idle window forward, and drop the expiries the row was
    // stamped with at mint if the client has since been switched to
    // non-expiring. Rotation performs the same reconciliation implicitly, by
    // minting the child row from the current config; the in-place path has to
    // write it. `null` clears a stored column, `undefined` leaves it alone.
    const expiryUpdate = resolveExchangeExpiryUpdate(client, refreshToken);
    const hasExpiryUpdate =
      expiryUpdate.expires_at !== undefined ||
      expiryUpdate.idle_expires_at !== undefined;

    if (hasExpiryUpdate) {
      // The login session must outlive the token it backs. A cleared column
      // contributes nothing, so a token that has just become non-expiring
      // leaves the session on its own clock — exactly as one minted without
      // expiries does.
      const absoluteExpiryMs =
        expiryUpdate.expires_at === null || !refreshToken.expires_at
          ? 0
          : new Date(refreshToken.expires_at).getTime();
      const idleExpiryMs = expiryUpdate.idle_expires_at
        ? new Date(expiryUpdate.idle_expires_at).getTime()
        : 0;
      const newLoginSessionExpiryMs = Math.max(absoluteExpiryMs, idleExpiryMs);

      await ctx.env.data.refreshTokens.update(
        client.tenant.id,
        refreshToken.id,
        {
          ...expiryUpdate,
          last_exchanged_at: new Date().toISOString(),
          ...(deviceChanged && {
            device: {
              ...refreshToken.device,
              last_ip: nextLastIp,
              last_user_agent: nextLastUa,
            },
          }),
          ...upgrade,
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
    } else if (upgrade) {
      await ctx.env.data.refreshTokens.update(
        client.tenant.id,
        refreshToken.id,
        upgrade,
      );
    }
  }

  // The exchange succeeded, so the session behind it is still alive. Nothing
  // above writes to the `sessions` row — the rotation bookkeeping all lands on
  // `refresh_tokens` — so without this stamp a session that is refreshed for
  // months still looks last-seen in its creation week to retention analytics.
  // Throttled and off the critical path; see `touchSessionUsedAt`.
  if (sessionId) {
    touchSessionUsedAt(ctx, client.tenant.id, sessionId);
  }

  return {
    user,
    client,
    refresh_token: outgoingWireToken,
    session_id: sessionId,
    login_id: refreshToken.login_id,
    // Carry the connection the user originally authenticated with so the
    // credentials-exchange hook sees it. We pass it via authConnection (not
    // loginSession) because the original session is already COMPLETED and
    // re-attaching it would trip the terminal-state guard in
    // createFrontChannelAuthResponse. When the session never recorded one,
    // createAuthTokens falls back to the user's connection.
    authConnection:
      refreshToken.auth_connection ?? loginSession?.auth_connection,
    organization,
    authParams: {
      client_id: client.client_id,
      audience: resourceServer?.audience,
      scope: resourceServer?.scopes,
      response_mode: AuthorizationResponseMode.WEB_MESSAGE,
    },
  };
}
