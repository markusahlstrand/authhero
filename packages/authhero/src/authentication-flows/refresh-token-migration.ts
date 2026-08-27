import { Context } from "hono";
import { nanoid } from "nanoid";
import {
  AuthorizationResponseMode,
  MigrationSource,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables, GrantFlowUserResult } from "../types";
import { EnrichedClient } from "../helpers/client";
import { getOrCreateUserByProvider } from "../helpers/users";
import { stringifyAuth0Client } from "../utils/client-info";
import { normalizeEmail } from "../utils/email";
import {
  Auth0UpstreamError,
  createMigrationProvider,
} from "../migration-providers";
import { LOGIN_SESSION_EXPIRATION_TIME } from "../constants";
import { authenticateLoginSession, createRefreshToken } from "./common";

const DEFAULT_REMINT_SCOPE = "openid profile email offline_access";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pickUsername(
  userinfo: { sub: string; email?: string },
  connection: string,
  issuer: string,
): string {
  if (userinfo.email) {
    return normalizeEmail(userinfo.email);
  }
  const connectionLc = connection.toLowerCase();
  const subLc = userinfo.sub.toLowerCase();
  try {
    return `${connectionLc}.${subLc}@${new URL(issuer).hostname.toLowerCase()}`;
  } catch {
    return `${connectionLc}.${subLc}@unknown`;
  }
}

/**
 * Try to redeem an unrecognized refresh token at one of the tenant's
 * configured migration sources. On success, lazy-create the local user
 * (matched by upstream `sub`), mint a fresh authhero refresh token, and
 * return a `GrantFlowUserResult` so the outer dispatcher can issue
 * access/id/refresh tokens through the normal mint path.
 *
 * Returns `null` if no migration source accepts the token, letting the
 * caller fall through to the standard `invalid_grant` response.
 */
export async function tryUpstreamRemint(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: EnrichedClient,
  refreshToken: string,
): Promise<GrantFlowUserResult | null> {
  if (!ctx.env.data.migrationSources) {
    return null;
  }

  const sources = await ctx.env.data.migrationSources.list(client.tenant.id);
  const enabled = sources.filter((s) => s.enabled);
  if (enabled.length === 0) {
    return null;
  }

  for (const source of enabled) {
    const result = await tryOne(ctx, client, refreshToken, source);
    if (result) {
      return result;
    }
  }

  return null;
}

async function tryOne(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: EnrichedClient,
  refreshToken: string,
  source: MigrationSource,
): Promise<GrantFlowUserResult | null> {
  let provider;
  try {
    provider = createMigrationProvider(source);
  } catch {
    // Unsupported provider type — skip this source rather than erroring out.
    return null;
  }

  let upstreamTokens;
  try {
    upstreamTokens = await provider.exchangeRefreshToken(refreshToken);
  } catch (err) {
    if (err instanceof Auth0UpstreamError) {
      // Upstream rejected this RT; try the next source.
      return null;
    }
    throw err;
  }

  const userinfo = await provider.fetchUserInfo(upstreamTokens.access_token);
  const { sub, ...profileData } = userinfo;
  const username = pickUsername(
    {
      sub,
      email: typeof userinfo.email === "string" ? userinfo.email : undefined,
    },
    source.connection,
    ctx.env.ISSUER,
  );

  ctx.set("user_id", sub);
  ctx.set("username", username);

  const user = await getOrCreateUserByProvider(ctx, {
    client,
    username,
    provider: source.connection,
    connection: source.connection,
    userId: sub,
    profileData: isRecord(profileData) ? profileData : {},
    isSocial: false,
    ip: ctx.var.ip,
  });

  // Create a synthetic login session + session so the freshly minted
  // authhero refresh token is anchored to a tracked login, matching the
  // shape produced by interactive flows.
  const ip = ctx.get("ip");
  const useragent = ctx.get("useragent");
  const auth0_client = ctx.get("auth0_client");

  const scope = DEFAULT_REMINT_SCOPE;
  const audience = client.tenant.default_audience;

  const loginSession = await ctx.env.data.loginSessions.create(
    client.tenant.id,
    {
      expires_at: new Date(
        Date.now() + LOGIN_SESSION_EXPIRATION_TIME,
      ).toISOString(),
      authParams: {
        client_id: client.client_id,
        scope,
        audience,
        username,
      },
      csrf_token: nanoid(),
      ip,
      useragent,
      auth0Client: stringifyAuth0Client(auth0_client),
    },
  );

  const session_id = await authenticateLoginSession(ctx, {
    user,
    client,
    loginSession,
    authConnection: source.connection,
  });

  const { wireToken } = await createRefreshToken(ctx, {
    user,
    client,
    login_id: loginSession.id,
    scope,
    audience,
  });

  return {
    user,
    client,
    session_id,
    login_id: loginSession.id,
    refresh_token: wireToken,
    authParams: {
      client_id: client.client_id,
      audience,
      scope,
      response_mode: AuthorizationResponseMode.WEB_MESSAGE,
    },
    authConnection: source.connection,
  };
}
