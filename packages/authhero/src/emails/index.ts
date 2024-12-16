import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { User } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";

export async function sendEmail(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  to: string,
  subject: string,
  html: string,
) {
  const emailProvider = await ctx.env.data.emailProviders.get(tenant_id);

  if (!emailProvider) {
    throw new HTTPException(500, { message: "Email provider not found" });
  }

  const emailService = ctx.env.emailProviders?.[emailProvider.name];
  if (!emailService) {
    throw new HTTPException(500, { message: "Email provider not found" });
  }

  await emailService({
    to,
    from: emailProvider.default_from_address || `login@${ctx.env.ISSUER}`,
    subject,
    html,
  });
}

export async function sendResetPassword(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  to: string,
  // auth0 just has a ticket, but we have a code and a state
  code: string,
  state?: string,
) {
  await sendEmail(
    ctx,
    tenant_id,
    to,
    `Reset your password`,
    `Click here to reset your password: ${ctx.env.ISSUER}u/reset-password?state=${state}&code=${code}`,
  );
}

export async function sendValidateEmailAddress(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  user: User,
) {
  await sendEmail(
    ctx,
    tenant_id,
    user.email,
    `Validate your email address`,
    `Click here to validate your email: ${ctx.env.ISSUER}u/validate-email`,
  );
}
