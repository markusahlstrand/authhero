import { Context } from "hono";
import { t } from "i18next";
import { Bindings, Variables } from "../types";
import { AuthParams, LogTypes, User } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { createLogMessage } from "../utils/create-log-message";
import { waitUntil } from "../helpers/wait-until";
import { getAuthUrl, getUniversalLoginUrl } from "../variables";

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
  const emailProvider =
    (await ctx.env.data.emailProviders.get(ctx.var.tenant_id)) ||
    // Fallback to default tenant
    (ctx.env.DEFAULT_TENANT_ID
      ? await ctx.env.data.emailProviders.get(ctx.env.DEFAULT_TENANT_ID)
      : null);

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
  text: string;
};

export async function sendSms(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: SendSmsParams,
) {
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
  if (!tenant) {
    throw new HTTPException(500, { message: "Tenant not found" });
  }

  const smsProvider =
    (await ctx.env.data.connections.list(ctx.var.tenant_id)).connections.find(
      (c) => c.strategy === "sms",
    ) ||
    // Fallback to default tenant
    (ctx.env.DEFAULT_TENANT_ID
      ? (
          await ctx.env.data.connections.list(ctx.env.DEFAULT_TENANT_ID)
        ).connections.find((c) => c.strategy === "sms")
      : null);

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
    text: params.text,
    template: "auth-code",
    data: {
      code: params.text,
      tenantName: tenant.name,
      tenantId: tenant.id,
    },
  });
}

export async function sendResetPassword(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  to: string,
  // auth0 just has a ticket, but we have a code and a state
  code: string,
  state?: string,
) {
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
  if (!tenant) {
    throw new HTTPException(500, { message: "Tenant not found" });
  }

  // the auth0 link looks like this:  https://auth.sesamy.dev/u/reset-verify?ticket={ticket}#
  const passwordResetUrl = `${getUniversalLoginUrl(ctx.env)}reset-password?state=${state}&code=${code}`;

  const options = {
    vendorName: tenant.name,
    lng: tenant.language || "en",
  };

  await sendEmail(ctx, {
    to,
    subject: t("reset_password_title", options),
    html: `Click here to reset your password: ${getUniversalLoginUrl(ctx.env)}reset-password?state=${state}&code=${code}`,
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
      tenantName: tenant.name,
      tenantId: tenant.id,
    },
  });
}

export interface SendCodeParams {
  to: string;
  code: string;
  connection: "email" | "sms";
}

export interface SendLinkParams extends SendCodeParams {
  authParams: AuthParams;
}

export async function sendCode(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  { to, code, connection }: SendCodeParams,
) {
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
  if (!tenant) {
    throw new HTTPException(500, { message: "Tenant not found" });
  }

  const loginUrl = new URL(getUniversalLoginUrl(ctx.env));

  const options = {
    vendorName: tenant.name,
    vendorId: tenant.id,
    loginDomain: loginUrl.hostname,
    code,
    lng: tenant.language || "en",
  };

  if (connection === "email") {
    await sendEmail(ctx, {
      to,
      subject: t("code_email_subject", options),
      html: `Click here to validate your email: ${getUniversalLoginUrl(ctx.env)}validate-email`,
      template: "auth-code",
      data: {
        code,
        vendorName: tenant.name,
        logo: tenant.logo || "",
        supportUrl: tenant.support_url || "",
        buttonColor: tenant.primary_color || "",
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
  } else if (connection === "sms") {
    await sendSms(ctx, {
      to,
      text: t("sms_code_text", options),
    });
  }

  const log = createLogMessage(ctx, {
    type: LogTypes.CODE_LINK_SENT,
    description: to,
  });
  waitUntil(ctx, ctx.env.data.logs.create(tenant.id, log));
}

export async function sendLink(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  { to, code, authParams, connection }: SendLinkParams,
) {
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
  if (!tenant) {
    throw new HTTPException(500, { message: "Tenant not found" });
  }

  if (!authParams.redirect_uri) {
    throw new HTTPException(400, { message: "redirect_uri is required" });
  }

  const magicLink = new URL(getAuthUrl(ctx.env));
  magicLink.pathname = "passwordless/verify_redirect";
  magicLink.searchParams.set("verification_code", code);
  magicLink.searchParams.set("connection", connection);
  magicLink.searchParams.set("client_id", authParams.client_id);
  magicLink.searchParams.set("redirect_uri", authParams.redirect_uri);
  magicLink.searchParams.set("username", to);
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
    vendorName: tenant.name,
    code,
    lng: tenant.language || "en",
  };

  if (connection !== "email") {
    throw new HTTPException(400, {
      message: "Only email connections are supported for magic links",
    });
  }

  await sendEmail(ctx, {
    to,
    subject: t("code_email_subject", options),
    html: `Click here to validate your email: ${getUniversalLoginUrl(ctx.env)}validate-email`,
    template: "auth-link",
    data: {
      code,
      vendorName: tenant.name,
      logo: tenant.logo || "",
      supportUrl: tenant.support_url || "",
      magicLink: magicLink.toString(),
      buttonColor: tenant.primary_color || "",
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

  const log = createLogMessage(ctx, {
    type: LogTypes.CODE_LINK_SENT,
    description: to,
  });
  waitUntil(ctx, ctx.env.data.logs.create(tenant.id, log));
}

export async function sendValidateEmailAddress(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  user: User,
) {
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
  if (!tenant) {
    throw new HTTPException(500, { message: "Tenant not found" });
  }

  const options = {
    vendorName: tenant.name,
    lng: tenant.language || "en",
  };

  await sendEmail(ctx, {
    to: user.email,
    subject: t("welcome_to_your_account", options),
    html: `Click here to validate your email: ${getUniversalLoginUrl(ctx.env)}validate-email`,
    template: "auth-verify-email",
    data: {
      vendorName: tenant.name,
      logo: tenant.logo || "",
      emailValidationUrl: `${getUniversalLoginUrl(ctx.env)}validate-email`,
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

export async function sendSignupValidateEmailAddress(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  to: string,
  code: string,
  state: string,
) {
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
  if (!tenant) {
    throw new HTTPException(500, { message: "Tenant not found" });
  }

  const options = {
    vendorName: tenant.name,
    lng: tenant.language || "en",
  };

  const signupUrl = `${getUniversalLoginUrl(ctx.env)}signup?state=${state}&code=${code}`;

  await sendEmail(ctx, {
    to,
    subject: t("register_password_account", options),
    html: `Click here to register: ${signupUrl}`,
    template: "auth-pre-signup-verification",
    data: {
      vendorName: tenant.name,
      logo: tenant.logo || "",
      signupUrl,
      setPassword: t("set_password", options),
      registerPasswordAccount: t("register_password_account", options),
      clickToSignUpDescription: t("click_to_sign_up_description", options),
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
