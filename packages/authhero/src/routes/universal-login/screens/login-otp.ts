import type { Context } from "hono";
import type { LoginSession } from "@authhero/adapter-interfaces";
import type { EnrichedClient } from "../../../helpers/client";
import type { Bindings, Variables } from "../../../types";
import generateOTP from "../../../utils/otp";
import { sendCode, sendLink } from "../../../emails";
import { OTP_EXPIRATION_TIME } from "../../../constants";

/**
 * Create a one-time code bound to the login session and deliver it to the
 * user, either as a code or (for magic-link email connections) as a link.
 */
export async function sendLoginOtp(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  {
    client,
    loginSession,
    to,
    magicLink,
  }: {
    client: EnrichedClient;
    loginSession: LoginSession;
    to: string;
    magicLink: boolean;
  },
) {
  let code_id = generateOTP();
  let existingCode = await ctx.env.data.codes.get(
    client.tenant.id,
    code_id,
    "otp",
  );

  while (existingCode) {
    code_id = generateOTP();
    existingCode = await ctx.env.data.codes.get(
      client.tenant.id,
      code_id,
      "otp",
    );
  }

  await ctx.env.data.codes.create(client.tenant.id, {
    code_id,
    code_type: "otp",
    login_id: loginSession.id,
    expires_at: new Date(Date.now() + OTP_EXPIRATION_TIME).toISOString(),
    redirect_uri: loginSession.authParams.redirect_uri,
  });

  // Extract language from ui_locales
  const language = loginSession.authParams?.ui_locales
    ?.split(" ")
    ?.map((locale: string) => locale.split("-")[0])[0];

  if (magicLink) {
    await sendLink(ctx, {
      to,
      code: code_id,
      authParams: loginSession.authParams,
      language,
    });
  } else {
    await sendCode(ctx, {
      to,
      code: code_id,
      language,
    });
  }
}
