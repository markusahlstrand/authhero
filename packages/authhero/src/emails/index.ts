import { Context } from "hono";
import { t } from "i18next";
import { Bindings, Variables } from "../types";
import { AuthParams, LogTypes, User } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { logMessage } from "../helpers/logging";
import { getAuthUrl, getUniversalLoginUrl } from "../variables";
import { getConnectionFromIdentifier } from "../utils/username";
import { getClientWithDefaults } from "../helpers/client";

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
  params: SendEmailParams,
) {
  const emailProvider = await ctx.env.data.emailProviders.get(ctx.var.tenant_id);

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

export type SendSmsParams = {
  to: string;
  from?: string;
  text: string;
  code: string;
};

export async function sendSms(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: SendSmsParams,
) {
  if (!ctx.var.client_id) {
    throw new HTTPException(500, { message: "Client not found" });
  }

  const client = await getClientWithDefaults(ctx.env, ctx.var.client_id);

  const smsProvider = client.connections.find((c) => c.strategy === "sms");
  if (!smsProvider) {
    throw new HTTPException(500, { message: "SMS provider not found" });
  }

  const provider = smsProvider.options?.provider || "twilio";

  const smsService = ctx.env.smsProviders?.[provider];
  if (!smsService) {
    throw new HTTPException(500, { message: "SMS provider not found" });
  }

  await smsService({
    options: smsProvider.options,
    to: params.to,
    from: params.from,
    text: params.text,
    template: "auth-code",
    data: {
      code: params.code,
      tenantName: client.tenant.friendly_name,
      tenantId: client.tenant.id,
    },
  });
}

export async function sendResetPassword(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  to: string,
  // auth0 just has a ticket, but we have a code and a state
  code: string,
  state?: string,
  language?: string,
) {
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
  if (!tenant) {
    throw new HTTPException(500, { message: "Tenant not found" });
  }

  // the auth0 link looks like this:  https://auth.sesamy.dev/u/reset-verify?ticket={ticket}#
  const passwordResetUrl = `${getUniversalLoginUrl(ctx.env)}reset-password?state=${state}&code=${code}`;

  const branding = await ctx.env.data.branding.get(ctx.var.tenant_id);
  const logo = branding?.logo_url || "";
  const buttonColor = branding?.colors?.primary || "#7d68f4";

  const options = {
    vendorName: tenant.friendly_name,
    lng: language || "en",
  };

  await sendEmail(ctx, {
    to,
    subject: t("reset_password_title", options),
    html: `Click here to reset your password: ${getUniversalLoginUrl(ctx.env)}reset-password?state=${state}&code=${code}`,
    template: "auth-password-reset",
    data: {
      vendorName: tenant.friendly_name,
      logo,
      passwordResetUrl,
      supportUrl: tenant.support_url || "https://support.sesamy.com",
      buttonColor,
      passwordResetTitle: t("password_reset_title", options),
      resetPasswordEmailClickToReset: t(
        "reset_password_email_click_to_reset",
        options,
      ),
      resetPasswordEmailReset: t("reset_password_email_reset", options),
      supportInfo: t("support_info", options),
      contactUs: t("contact_us", options),
      copyright: t("copyright", options),
      tenantName: tenant.friendly_name,
      tenantId: tenant.id,
    },
  });

  // Log the password reset request
  logMessage(ctx, tenant.id, {
    type: LogTypes.SUCCESS_CHANGE_PASSWORD_REQUEST,
    description: to,
  });
}

export interface SendCodeParams {
  to: string;
  code: string;
  language?: string;
}

export interface SendLinkParams extends SendCodeParams {
  authParams: AuthParams;
}

export async function sendCode(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  { to, code, language }: SendCodeParams,
) {
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
  if (!tenant) {
    throw new HTTPException(500, { message: "Tenant not found" });
  }

  const { connectionType } = getConnectionFromIdentifier(to);

  const branding = await ctx.env.data.branding.get(ctx.var.tenant_id);
  const logo = branding?.logo_url || "";
  const buttonColor = branding?.colors?.primary || "#7d68f4";

  const loginUrl = new URL(getUniversalLoginUrl(ctx.env));

  const options = {
    vendorName: tenant.friendly_name,
    vendorId: tenant.id,
    loginDomain: loginUrl.hostname,
    code,
    lng: language || "en",
  };

  if (connectionType === "email") {
    await sendEmail(ctx, {
      to,
      subject: t("code_email_subject", options),
      html: `Click here to validate your email: ${getUniversalLoginUrl(ctx.env)}validate-email`,
      template: "auth-code",
      data: {
        code,
        vendorName: tenant.friendly_name,
        logo,
        supportUrl: tenant.support_url || "",
        buttonColor,
        welcomeToYourAccount: t("welcome_to_your_account", options),
        linkEmailClickToLogin: t("link_email_click_to_login", options),
        linkEmailLogin: t("link_email_login", options),
        linkEmailOrEnterCode: t("link_email_or_enter_code", options),
        codeValid30Mins: t("code_valid_30_minutes", options),
        supportInfo: t("support_info", options),
        contactUs: t("contact_us", options),
        copyright: t("copyright", options),
      },
    });
  } else if (connectionType === "sms") {
    await sendSms(ctx, {
      to,
      text: t("sms_code_text", options),
      code,
      from: tenant.friendly_name,
    });
  }

  logMessage(ctx, tenant.id, {
    type: LogTypes.CODE_LINK_SENT,
    description: to,
  });
}

export async function sendLink(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  { to, code, authParams, language }: SendLinkParams,
) {
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
  if (!tenant) {
    throw new HTTPException(500, { message: "Tenant not found" });
  }

  if (!authParams.redirect_uri) {
    throw new HTTPException(400, { message: "redirect_uri is required" });
  }

  const { connectionType } = getConnectionFromIdentifier(to);

  const branding = await ctx.env.data.branding.get(ctx.var.tenant_id);
  const logo = branding?.logo_url || "";
  const buttonColor = branding?.colors?.primary || "";

  const magicLink = new URL(getAuthUrl(ctx.env));
  magicLink.pathname = "passwordless/verify_redirect";
  magicLink.searchParams.set("verification_code", code);
  magicLink.searchParams.set("connection", connectionType);
  magicLink.searchParams.set("client_id", authParams.client_id);
  magicLink.searchParams.set("redirect_uri", authParams.redirect_uri);
  magicLink.searchParams.set("email", to);
  if (authParams.response_type) {
    magicLink.searchParams.set("response_type", authParams.response_type);
  }
  if (authParams.scope) {
    magicLink.searchParams.set("scope", authParams.scope);
  }
  if (authParams.state) {
    magicLink.searchParams.set("state", authParams.state);
  }
  if (authParams.nonce) {
    magicLink.searchParams.set("nonce", authParams.nonce);
  }
  if (authParams.code_challenge) {
    magicLink.searchParams.set("code_challenge", authParams.code_challenge);
  }
  if (authParams.code_challenge_method) {
    magicLink.searchParams.set(
      "code_challenge_method",
      authParams.code_challenge_method,
    );
  }
  if (authParams.audience) {
    magicLink.searchParams.set("audience", authParams.audience);
  }

  const options = {
    vendorName: tenant.friendly_name,
    code,
    lng: language || "en",
  };

  if (connectionType === "email") {
    await sendEmail(ctx, {
      to,
      subject: t("code_email_subject", options),
      html: `Click here to validate your email: ${getUniversalLoginUrl(ctx.env)}validate-email`,
      template: "auth-link",
      data: {
        code,
        vendorName: tenant.friendly_name,
        logo,
        supportUrl: tenant.support_url || "",
        magicLink: magicLink.toString(),
        buttonColor,
        welcomeToYourAccount: t("welcome_to_your_account", options),
        linkEmailClickToLogin: t("link_email_click_to_login", options),
        linkEmailLogin: t("link_email_login", options),
        linkEmailOrEnterCode: t("link_email_or_enter_code", options),
        codeValid30Mins: t("code_valid_30_minutes", options),
        supportInfo: t("support_info", options),
        contactUs: t("contact_us", options),
        copyright: t("copyright", options),
      },
    });
  } else if (connectionType === "sms") {
    // For SMS connection, send the magic link via SMS
    await sendSms(ctx, {
      to,
      text: `${t("link_sms_login", options)}: ${magicLink.toString()}`,
      code,
      from: tenant.friendly_name,
    });
  } else {
    throw new HTTPException(400, {
      message: "Only email and SMS connections are supported for magic links",
    });
  }

  logMessage(ctx, tenant.id, {
    type: LogTypes.CODE_LINK_SENT,
    description: to,
  });
}

export async function sendValidateEmailAddress(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  user: User,
  language?: string,
) {
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
  if (!tenant) {
    throw new HTTPException(500, { message: "Tenant not found" });
  }

  if (!user.email) {
    throw new HTTPException(400, { message: "User has no email" });
  }

  const branding = await ctx.env.data.branding.get(ctx.var.tenant_id);
  const logo = branding?.logo_url || "";
  const buttonColor = branding?.colors?.primary || "#7d68f4";

  const options = {
    vendorName: tenant.friendly_name,
    lng: language || "en",
  };

  await sendEmail(ctx, {
    to: user.email,
    subject: t("welcome_to_your_account", options),
    html: `Click here to validate your email: ${getUniversalLoginUrl(ctx.env)}validate-email`,
    template: "auth-verify-email",
    data: {
      vendorName: tenant.friendly_name,
      logo,
      emailValidationUrl: `${getUniversalLoginUrl(ctx.env)}validate-email`,
      supportUrl: tenant.support_url || "https://support.sesamy.com",
      buttonColor,
      welcomeToYourAccount: t("welcome_to_your_account", options),
      verifyEmailVerify: t("verify_email_verify", options),
      supportInfo: t("support_info", options),
      contactUs: t("contact_us", options),
      copyright: t("copyright", options),
    },
  });
}

export async function sendSignupValidateEmailAddress(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  to: string,
  code: string,
  state: string,
  language?: string,
) {
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
  if (!tenant) {
    throw new HTTPException(500, { message: "Tenant not found" });
  }

  const branding = await ctx.env.data.branding.get(ctx.var.tenant_id);
  const logo = branding?.logo_url || "";
  const buttonColor = branding?.colors?.primary || "#7d68f4";

  const options = {
    vendorName: tenant.friendly_name,
    lng: language || "en",
  };

  const signupUrl = `${getUniversalLoginUrl(ctx.env)}signup?state=${state}&code=${code}`;

  await sendEmail(ctx, {
    to,
    subject: t("register_password_account", options),
    html: `Click here to register: ${signupUrl}`,
    template: "auth-pre-signup-verification",
    data: {
      vendorName: tenant.friendly_name,
      logo,
      signupUrl,
      setPassword: t("set_password", options),
      registerPasswordAccount: t("register_password_account", options),
      clickToSignUpDescription: t("click_to_sign_up_description", options),
      supportUrl: tenant.support_url || "https://support.sesamy.com",
      buttonColor,
      welcomeToYourAccount: t("welcome_to_your_account", options),
      verifyEmailVerify: t("verify_email_verify", options),
      supportInfo: t("support_info", options),
      contactUs: t("contact_us", options),
      copyright: t("copyright", options),
    },
  });
}
