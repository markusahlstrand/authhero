import { Context } from "hono";
import bcryptjs from "bcryptjs";
import { createLogMessage } from "../utils/create-log-message";
import { HTTPException } from "hono/http-exception";
import { AuthParams, Client, LogTypes } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { getUserByEmailAndProvider } from "../helpers/users";
import { AuthError } from "../types/AuthError";
import { sendValidateEmailAddress } from "../emails";
import { waitUntil } from "../helpers/wait-until";

export async function loginWithPassword(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: Client,
  authParams: AuthParams & { password: string },
) {
  const { env } = ctx;

  const email = authParams.username;
  ctx.set("username", email);
  if (!email) {
    throw new HTTPException(400, { message: "Username is required" });
  }

  const user = await getUserByEmailAndProvider({
    userAdapter: ctx.env.data.users,
    tenant_id: client.tenant.id,
    email,
    provider: "auth2",
  });

  if (!user) {
    const log = createLogMessage(ctx, {
      type: LogTypes.FAILED_LOGIN_INCORRECT_PASSWORD,
      description: "Invalid user",
    });

    waitUntil(ctx, ctx.env.data.logs.create(client.tenant.id, log));

    throw new AuthError(403, {
      message: "User not found",
      code: "USER_NOT_FOUND",
    });
  }

  const primaryUser = user.linked_to
    ? await env.data.users.get(client.tenant.id, user.linked_to)
    : user;

  if (!primaryUser) {
    throw new AuthError(403, {
      message: "User not found",
      code: "USER_NOT_FOUND",
    });
  }

  ctx.set("connection", user.connection);
  ctx.set("user_id", primaryUser.user_id);

  const { password } = await env.data.passwords.get(
    client.tenant.id,
    user.user_id,
  );

  const valid = await bcryptjs.compare(authParams.password, password);

  if (!valid) {
    const log = createLogMessage(ctx, {
      type: LogTypes.FAILED_LOGIN_INCORRECT_PASSWORD,
      description: "Invalid password",
    });

    waitUntil(ctx, ctx.env.data.logs.create(client.tenant.id, log));

    throw new AuthError(403, {
      message: "Invalid password",
      code: "INVALID_PASSWORD",
    });
  }

  // Check the logs for failed login attempts
  const logs = await env.data.logs.list(client.tenant.id, {
    page: 0,
    per_page: 10,
    include_totals: false,
    q: `user_id:${primaryUser.user_id}`,
  });

  const failedLogins = logs.logs.filter(
    (log) =>
      log.type === LogTypes.FAILED_LOGIN_INCORRECT_PASSWORD &&
      new Date(log.date) > new Date(Date.now() - 1000 * 60 * 5),
  );

  if (failedLogins.length >= 3) {
    const log = createLogMessage(ctx, {
      // TODO: change to BLOCKED_ACCOUNT_EMAIL
      type: LogTypes.FAILED_LOGIN,
      description: "Too many failed login attempts",
    });

    waitUntil(ctx, ctx.env.data.logs.create(client.tenant.id, log));

    throw new AuthError(403, {
      message: "Too many failed login attempts",
      code: "TOO_MANY_FAILED_LOGINS",
    });
  }

  if (!user.email_verified && client.email_validation === "enforced") {
    await sendValidateEmailAddress(ctx, user);

    const log = createLogMessage(ctx, {
      type: LogTypes.FAILED_LOGIN,
      description: "Email not verified",
    });
    await ctx.env.data.logs.create(client.tenant.id, log);

    throw new AuthError(403, {
      message: "Email not verified",
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  const log = createLogMessage(ctx, {
    type: LogTypes.SUCCESS_LOGIN,
    description: "Successful login",
    strategy_type: "Username-Password-Authentication",
    strategy: "Username-Password-Authentication",
  });
  waitUntil(ctx, ctx.env.data.logs.create(client.tenant.id, log));

  return primaryUser;
}
