import { Context } from "hono";
import {
  LogTypes,
  LoginSession,
  RateLimitDecision,
  User,
  isDatabaseConnectionStrategy,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { EnrichedClient } from "../helpers/client";
import { sendEmailVerificationCode } from "../emails";
import { logMessage } from "../helpers/logging";
import { resolvePrimaryUser } from "../helpers/users";
import { OTP_EXPIRATION_TIME } from "../constants";
import generateOTP from "../utils/otp";

export type EmailVerificationMethod = "link" | "code";

/**
 * How a login that is blocked on an unverified email (client
 * `email_validation: "enforced"`) should verify it. UI flows pass this to
 * `passwordGrant`; without it the grant falls back to emailing a link and
 * failing the login session (token endpoint, legacy /u routes).
 */
export interface LoginEmailVerification {
  method: EmailVerificationMethod;
  /** Link method only: where the emailed link returns the user. */
  resultUrl?: string;
}

/**
 * Marker stored in the code's `state` so a login email-verification code is
 * never confused with the other `email_verification` codes (pre-signup,
 * change-email), which share the code type.
 */
const LOGIN_EMAIL_VERIFICATION_PURPOSE = "login_email_verification";

function isRateLimitDecision(value: unknown): value is RateLimitDecision {
  return (
    typeof value === "object" &&
    value !== null &&
    "allowed" in value &&
    typeof value.allowed === "boolean"
  );
}

/**
 * The database connection's `attributes.email.verification_method`. Defaults
 * to "code" like the u2 password reset, so the user stays on the login page
 * instead of depending on an emailed link.
 */
export function getEmailVerificationMethod(
  client: EnrichedClient,
): EmailVerificationMethod {
  const passwordConnection = client.connections.find((c) =>
    isDatabaseConnectionStrategy(c.strategy),
  );
  return (
    passwordConnection?.options?.attributes?.email?.verification_method ??
    "code"
  );
}

/**
 * Mint a one-time code bound to the login session and email it. The code is
 * only issued after the password has been validated, so redeeming it proves
 * both factors and lets the same login session complete.
 */
export async function sendLoginEmailVerificationCode(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: {
    client: EnrichedClient;
    user: User;
    loginSession: LoginSession;
    connection: string;
    language?: string;
  },
) {
  const { client, user, loginSession, connection, language } = params;
  const { data } = ctx.env;

  let codeId = generateOTP();
  while (await data.codes.get(client.tenant.id, codeId, "email_verification")) {
    codeId = generateOTP();
  }

  await data.codes.create(client.tenant.id, {
    code_id: codeId,
    code_type: "email_verification",
    login_id: loginSession.id,
    user_id: user.user_id,
    expires_at: new Date(Date.now() + OTP_EXPIRATION_TIME).toISOString(),
    state: JSON.stringify({
      purpose: LOGIN_EMAIL_VERIFICATION_PURPOSE,
      connection,
    }),
  });

  await sendEmailVerificationCode(ctx, user, codeId, language);
}

export type VerifyLoginEmailCodeResult =
  | {
      ok: true;
      /** The primary user to complete the login as. */
      user: User;
      /** The connection the password login targeted. */
      connection: string;
    }
  | { ok: false; reason: "invalid" | "rate_limited" };

/**
 * Redeem a login email-verification code: marks the verified identity's
 * email as verified and returns the user to complete the login with.
 */
export async function verifyLoginEmailCode(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: EnrichedClient,
  loginSession: LoginSession,
  code: string,
): Promise<VerifyLoginEmailCodeResult> {
  const { data } = ctx.env;
  const tenantId = client.tenant.id;

  // A 6-digit code is ~20 bits; throttle guesses per login session so the
  // keyspace can't be swept while the code is valid.
  if (data.rateLimit) {
    let decision: RateLimitDecision = { allowed: true };
    try {
      const result: unknown = await data.rateLimit.consume(
        "brute-force",
        `email-verification:${tenantId}:${loginSession.id}`,
      );
      if (isRateLimitDecision(result)) {
        decision = result;
      }
    } catch (error) {
      // Fail open: a misbehaving rate-limit adapter must not lock users out.
      console.error("Email verification rate limit consume failed:", error);
    }
    if (!decision.allowed) {
      logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_VERIFICATION_EMAIL,
        description: "Rate limit exceeded for email verification code",
      });
      return { ok: false, reason: "rate_limited" };
    }
  }

  const fail = (description: string, userId?: string) => {
    logMessage(ctx, tenantId, {
      type: LogTypes.FAILED_VERIFICATION_EMAIL,
      description,
      userId,
    });
    return { ok: false, reason: "invalid" } as const;
  };

  const stored = await data.codes.get(tenantId, code, "email_verification");
  if (!stored || stored.login_id !== loginSession.id || !stored.user_id) {
    return fail("Code invalid");
  }

  let meta: { purpose?: unknown; connection?: unknown } = {};
  try {
    meta = stored.state ? JSON.parse(stored.state) : {};
  } catch {
    // Treated as the wrong purpose below
  }
  if (meta.purpose !== LOGIN_EMAIL_VERIFICATION_PURPOSE) {
    return fail("Code invalid", stored.user_id);
  }
  if (stored.expires_at < new Date().toISOString()) {
    return fail("Code expired", stored.user_id);
  }
  if (!(await data.codes.consume(tenantId, code))) {
    return fail("Code already used", stored.user_id);
  }

  const user = await data.users.get(tenantId, stored.user_id);
  if (!user) {
    return fail("User not found", stored.user_id);
  }

  await data.users.update(tenantId, user.user_id, { email_verified: true });

  logMessage(ctx, tenantId, {
    type: LogTypes.SUCCESS_VERIFICATION_EMAIL,
    description: "Successful email verification",
    userId: user.user_id,
  });

  const primaryUser = await resolvePrimaryUser(data.users, tenantId, {
    ...user,
    email_verified: true,
  });

  // The block check in passwordGrant ran before the code was issued; an
  // account blocked since then must not complete the login.
  if (primaryUser.blocked) {
    return fail("User is blocked", primaryUser.user_id);
  }
  if (primaryUser.linked_to) {
    return fail("User not found", primaryUser.user_id);
  }

  return {
    ok: true,
    user: primaryUser,
    connection:
      typeof meta.connection === "string" ? meta.connection : user.connection,
  };
}
