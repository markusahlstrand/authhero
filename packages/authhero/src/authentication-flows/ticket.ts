import { AuthParams } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { getPrimaryUserByEmailAndProvider } from "../helpers/users";
import { userIdGenerate } from "../utils/user-id";
import { createAuthResponse, createSession } from "./common";

function getProviderFromRealm(realm: string) {
  if (realm === "Username-Password-Authentication") {
    return "auth2";
  }

  if (realm === "email") {
    return "email";
  }

  throw new HTTPException(403, { message: "Invalid realm" });
}

/**
 * Authenticates a ticket by validating its code, retrieving or creating a corresponding user, and establishing a session.
 *
 * This asynchronous function performs the following steps:
 * 1. Sets the connection in the provided context based on the `realm`.
 * 2. Retrieves the ticket code using `tenant_id` and `ticketId` from the environment data store. If no code is found or if it has already been used, an HTTPException (status 403) is thrown.
 * 3. Fetches the associated login record using the code's `login_id`. If the login is missing or lacks a username, an HTTPException (status 403) is thrown.
 * 4. Retrieves the client record via the login's authentication parameters. If not found, an HTTPException (status 403) is thrown.
 * 5. Marks the ticket code as used in the database.
 * 6. Determines the authentication provider from the `realm` using `getProviderFromRealm`.
 * 7. Attempts to find the primary user by email and provider. If the user does not exist, a new user is created.
 * 8. Updates the context with the user's email and user ID.
 * 9. Creates a session using the provided authentication parameters.
 * 10. Returns an authentication response, which includes the updated authentication parameters, login session, new session ID (accessed via `session.id`), user, and client details.
 *
 * @param ctx - The context object containing environment bindings and runtime variables.
 * @param tenant_id - The unique identifier of the tenant.
 * @param ticketId - The unique identifier of the ticket to authenticate.
 * @param authParams - The authentication parameters, including scope and audience settings.
 * @param realm - The authentication realm, which determines the connection and provider (e.g., "Username-Password-Authentication" or "email").
 *
 * @returns A promise resolving to an authentication response object containing:
 * - Updated authentication parameters (with scope and audience)
 * - The original login session details
 * - The session ID from the newly created session
 * - User information
 * - Client information
 *
 * @throws HTTPException - Thrown with status 403 if:
 *   - The ticket code is not found or has already been used.
 *   - The login session is missing or invalid.
 *   - The client associated with the login cannot be found.
 *
 * @example
 * const authResponse = await ticketAuth(ctx, "tenant123", "ticket456", { scope: "read", audience: "api" }, "email");
 */
export async function ticketAuth(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  ticketId: string,
  authParams: AuthParams,
  realm: string,
) {
  const { env } = ctx;

  ctx.set("connection", realm);

  const code = await env.data.codes.get(tenant_id, ticketId, "ticket");
  if (!code || code.used_at) {
    throw new HTTPException(403, { message: "Ticket not found" });
  }

  const login = await env.data.logins.get(tenant_id, code.login_id);
  if (!login || !login.authParams.username) {
    throw new HTTPException(403, { message: "Session not found" });
  }

  const client = await env.data.clients.get(login.authParams.client_id);
  if (!client) {
    throw new HTTPException(403, { message: "Client not found" });
  }
  ctx.set("client_id", login.authParams.client_id);

  await env.data.codes.used(tenant_id, ticketId);

  const provider = getProviderFromRealm(realm);

  let user = await getPrimaryUserByEmailAndProvider({
    userAdapter: env.data.users,
    tenant_id,
    email: login.authParams.username,
    provider,
  });

  if (!user) {
    user = await env.data.users.create(tenant_id, {
      user_id: `email|${userIdGenerate()}`,
      email: login.authParams.username,
      name: login.authParams.username,
      provider: "email",
      connection: "email",
      email_verified: true,
      is_social: false,
      last_ip: "",
      last_login: new Date().toISOString(),
    });
  }

  ctx.set("username", user.email);
  ctx.set("user_id", user.user_id);

  const session = await createSession(ctx, {
    user,
    client,
    scope: authParams.scope,
    audience: authParams.audience,
  });
  return createAuthResponse(ctx, {
    authParams: {
      scope: login.authParams?.scope,
      ...authParams,
    },
    loginSession: login,
    sessionId: session.id,
    user,
    client,
  });
}
