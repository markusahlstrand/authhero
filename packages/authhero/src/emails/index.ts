import { Context } from "hono";
import { t } from "i18next";
import { Bindings, Variables } from "../types";
import { User } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";

export type SendEmailParams = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  template: string;
  data: Record<string, string>;
};

export async function sendEmail(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  params: SendEmailParams,
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
    emailProvider,
    ...params,
    from: emailProvider.default_from_address || `login@${ctx.env.ISSUER}`,
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
  const tenant = await ctx.env.data.tenants.get(tenant_id);
  if (!tenant) {
    throw new HTTPException(500, { message: "Tenant not found" });
  }

  // the auth0 link looks like this:  https://auth.sesamy.dev/u/reset-verify?ticket={ticket}#
  const passwordResetUrl = `${ctx.env.ISSUER}u/reset-password?state=${state}&code=${code}`;

  const options = {
    vendorName: tenant.name,
    lng: tenant.language || "en",
  };

  await sendEmail(ctx, tenant_id, {
    to,
    subject: `Reset your password`,
    html: `Click here to reset your password: ${ctx.env.ISSUER}u/reset-password?state=${state}&code=${code}`,
    template: "auth-password-reset",
    data: {
      vendorName: tenant.name,
      logo: tenant.logo || "",
      passwordResetUrl,
      supportUrl: tenant.support_url || "https://support.sesamy.com",
      buttonColor: tenant.primary_color || "#7d68f4",
      passwordResetTitle: t("password_reset_title", options),
      resetPasswordEmailClickToReset: t(
        "reset_password_email_click_to_reset",
        options,
      ),
      resetPasswordEmailReset: t("reset_password_email_reset", options),
      supportInfo: t("support_info", options),
      contactUs: t("contact_us", options),
      copyright: t("copyright", options),
    },
  });
}

export async function sendValidateEmailAddress(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  user: User,
) {
  const tenant = await ctx.env.data.tenants.get(tenant_id);
  if (!tenant) {
    throw new HTTPException(500, { message: "Tenant not found" });
  }

  const options = {
    vendorName: tenant.name,
    lng: tenant.language || "en",
  };

  await sendEmail(ctx, tenant_id, {
    to: user.email,
    subject: `Validate your email address`,
    html: `Click here to validate your email: ${ctx.env.ISSUER}u/validate-email`,
    template: "auth-verify-email",
    data: {
      vendorName: tenant.name,
      logo: tenant.logo || "",
      emailValidationUrl: `${ctx.env.ISSUER}u/validate-email`,
      supportUrl: tenant.support_url || "https://support.sesamy.com",
      buttonColor: tenant.primary_color || "#7d68f4",
      welcomeToYourAccount: t("welcome_to_your_account", options),
      verifyEmailVerify: t("verify_email_verify", options),
      supportInfo: t("support_info", options),
      contactUs: t("contact_us", options),
      copyright: t("copyright", options),
    },
  });
}
