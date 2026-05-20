import { Context } from "hono";
import { Connection, LogTypes, User } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { EnrichedClient } from "../helpers/client";
import {
  Auth0UpstreamError,
  fetchUserInfo,
  passwordRealmGrant,
} from "../utils/auth0-upstream";
import { hashPassword } from "../helpers/password-policy";
import { userIdGenerate } from "../utils/user-id";
import { resolveUsernamePasswordProvider } from "../utils/username-password-provider";
import { logMessage } from "../helpers/logging";

interface Auth0SourceCredentials {
  tokenEndpoint: string;
  userinfoEndpoint: string;
  clientId: string;
  clientSecret: string;
  realm?: string;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Read the upstream migration credentials from a DB connection's
 * `options.configuration` (Auth0-shape: the destination connection holds the
 * upstream creds inline). Returns null if any required field is missing —
 * callers should treat this as "migration is not configured" and fall through
 * to the normal failure path.
 */
export function readAuth0SourceCredentials(
  dbConnection: Connection,
): Auth0SourceCredentials | null {
  const config =
    dbConnection.options && typeof dbConnection.options === "object"
      ? (dbConnection.options as Record<string, unknown>).configuration
      : undefined;
  if (!config || typeof config !== "object") {
    return null;
  }
  const c = config as Record<string, unknown>;
  const tokenEndpoint = readString(c.token_endpoint);
  const userinfoEndpoint = readString(c.userinfo_endpoint);
  const clientId = readString(c.client_id);
  const clientSecret = readString(c.client_secret);
  const realm = readString(c.realm);

  if (!tokenEndpoint || !userinfoEndpoint || !clientId || !clientSecret) {
    return null;
  }
  return { tokenEndpoint, userinfoEndpoint, clientId, clientSecret, realm };
}

interface AttemptUpstreamPasswordParams {
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>;
  client: EnrichedClient;
  username: string;
  password: string;
  /**
   * The local DB connection the login is targeting. Its `name` is sent as
   * `realm` to upstream Auth0 (unless `options.configuration.realm` overrides
   * it), and its `options.configuration` carries the upstream credentials.
   * Must have `options.import_mode: true` to be eligible.
   */
  dbConnection: Connection;
  /**
   * The local user, if one already exists. When null, a new user record is
   * created from the `/userinfo` profile on upstream success.
   */
  existingUser: User | null;
}

/**
 * Attempts to verify the supplied password against the upstream Auth0 tenant
 * via the password-realm grant. On success, creates the local user (if
 * missing), stores the bcrypt hash of the password locally, and returns the
 * user. On any failure, returns null — the caller surfaces the existing
 * INVALID_PASSWORD/USER_NOT_FOUND error so the upstream's existence is not
 * leaked to clients.
 *
 * Subsequent logins are served entirely locally because the password row now
 * exists on our side.
 */
export async function attemptUpstreamPasswordFallback(
  params: AttemptUpstreamPasswordParams,
): Promise<User | null> {
  const { ctx, client, username, password, dbConnection, existingUser } =
    params;

  if (dbConnection.options?.import_mode !== true) {
    return null;
  }

  const credentials = readAuth0SourceCredentials(dbConnection);
  if (!credentials) {
    return null;
  }

  let tokens;
  try {
    tokens = await passwordRealmGrant({
      tokenEndpoint: credentials.tokenEndpoint,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      realm: credentials.realm ?? dbConnection.name,
      username,
      password,
    });
  } catch (err) {
    if (err instanceof Auth0UpstreamError) {
      console.warn(
        `Auth0 upstream ROPG failed for tenant=${client.tenant.id} realm=${dbConnection.name}: ${err.code} ${err.description ?? ""}`,
      );
      return null;
    }
    throw err;
  }

  const data = ctx.env.data;
  let user = existingUser;

  if (!user) {
    let profile;
    try {
      profile = await fetchUserInfo(
        credentials.userinfoEndpoint,
        tokens.access_token,
      );
    } catch (err) {
      if (err instanceof Auth0UpstreamError) {
        console.warn(
          `Auth0 upstream userinfo failed for tenant=${client.tenant.id}: ${err.code} ${err.description ?? ""}`,
        );
        return null;
      }
      throw err;
    }

    const usernameLooksLikeEmail = username.includes("@");
    const profileEmail =
      typeof profile.email === "string" ? profile.email : undefined;
    const provider = await resolveUsernamePasswordProvider(
      ctx.env,
      client.tenant.id,
    );
    const userId = `${provider}|${userIdGenerate()}`;

    // Signal to the signup gates that this users.create is a lazy-migration
    // import. With `disable_signup: true` set on an import_mode connection
    // (the Auth0 pattern for "no new signups, but migrate existing upstream
    // users") preUserSignupHook would otherwise reject the creation.
    ctx.set("is_lazy_migration", true);
    try {
      user = await data.users.create(client.tenant.id, {
        user_id: userId,
        email: profileEmail ?? (usernameLooksLikeEmail ? username : undefined),
        username: usernameLooksLikeEmail ? undefined : username,
        name: typeof profile.name === "string" ? profile.name : username,
        given_name:
          typeof profile.given_name === "string"
            ? profile.given_name
            : undefined,
        family_name:
          typeof profile.family_name === "string"
            ? profile.family_name
            : undefined,
        nickname:
          typeof profile.nickname === "string" ? profile.nickname : undefined,
        picture:
          typeof profile.picture === "string" ? profile.picture : undefined,
        email_verified: profile.email_verified === true,
        provider,
        connection: dbConnection.name,
        is_social: false,
        last_ip: ctx.var.ip ?? "",
        last_login: new Date().toISOString(),
        profileData: JSON.stringify(profile),
      });
    } finally {
      ctx.set("is_lazy_migration", false);
    }
  }

  const { hash, algorithm } = await hashPassword(password);

  // Demote any existing current password row so we don't end up with two
  // is_current rows for the same user.
  const existingPassword = await data.passwords.get(
    client.tenant.id,
    user.user_id,
  );
  if (existingPassword) {
    await data.passwords.update(client.tenant.id, {
      id: existingPassword.id,
      user_id: user.user_id,
      password: existingPassword.password,
      algorithm: existingPassword.algorithm,
      is_current: false,
    });
  }

  await data.passwords.create(client.tenant.id, {
    user_id: user.user_id,
    password: hash,
    algorithm,
    is_current: true,
  });

  logMessage(ctx, client.tenant.id, {
    type: LogTypes.SUCCESS_PASSWORD_MIGRATION,
    description: `Imported password from upstream for ${user.user_id}`,
    userId: user.user_id,
    connection: dbConnection.name,
  });

  return user;
}
