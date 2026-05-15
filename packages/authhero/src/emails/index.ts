import { Context } from "hono";
import { t } from "i18next";
import { Bindings, Variables } from "../types";
import {
  AuthParams,
  EmailServiceAdapter,
  EmailTemplateName,
  LogTypes,
  Strategy,
  User,
} from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { logMessage } from "../helpers/logging";
import { getAuthUrl, getUniversalLoginUrl } from "../variables";
import { getConnectionFromIdentifier } from "../utils/username";
import { getEnrichedClient } from "../helpers/client";
import { renderEmailTemplate } from "./render";
import { MailgunEmailService } from "../email-services/mailgun";
import { ResendEmailService } from "../email-services/resend";
import { PostmarkEmailService } from "../email-services/postmark";

const BUILT_IN_EMAIL_SERVICES: Record<string, () => EmailServiceAdapter> = {
  mailgun: () => new MailgunEmailService(),
  resend: () => new ResendEmailService(),
  postmark: () => new PostmarkEmailService(),
};

export type SendEmailParams = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  template: string;
  data: Record<string, string>;
  from?: string;
};

export async function sendEmail(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: SendEmailParams,
) {
  const emailProvider = await ctx.env.data.emailProviders.get(
    ctx.var.tenant_id,
  );

  if (!emailProvider) {
    throw new HTTPException(500, { message: "Email provider not found" });
  }

  const builtInFactory = BUILT_IN_EMAIL_SERVICES[emailProvider.name];
  const emailService = builtInFactory
    ? builtInFactory()
    : ctx.env.data.emailService;
  if (!emailService) {
    throw new HTTPException(500, { message: "Email service not configured" });
  }

  try {
    await emailService.send({
      emailProvider,
      ...params,
      from:
        params.from ||
        emailProvider.default_from_address ||
        `login@${ctx.env.ISSUER}`,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `[sendEmail] tenant=${ctx.var.tenant_id} provider=${emailProvider.name} template=${params.template} to=${params.to}: ${errorMessage}`,
      err,
    );
    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.FAILED_SENDING_NOTIFICATION,
      description: `email send failed via ${emailProvider.name}: ${errorMessage}`.slice(
        0,
        500,
      ),
      details: {
        provider: emailProvider.name,
        template: params.template,
        to: params.to,
        error: errorMessage,
      },
      waitForCompletion: true,
    });
    throw err;
  }
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

  const client = await getEnrichedClient(ctx.env, ctx.var.client_id);

  const smsProvider = client.connections.find(
    (c) => c.strategy === Strategy.SMS,
  );
  if (!smsProvider) {
    throw new HTTPException(500, { message: "SMS provider not found" });
  }

  const smsService = ctx.env.data.smsService;
  if (!smsService) {
    throw new HTTPException(500, { message: "SMS service not configured" });
  }

  try {
    await smsService.send({
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
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `[sendSms] tenant=${ctx.var.tenant_id} connection=${smsProvider.name} to=${params.to}: ${errorMessage}`,
      err,
    );
    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.FAILED_SENDING_NOTIFICATION,
      description: `sms send failed via ${smsProvider.name}: ${errorMessage}`.slice(
        0,
        500,
      ),
      details: {
        connection: smsProvider.name,
        to: params.to,
        error: errorMessage,
      },
      waitForCompletion: true,
    });
    throw err;
  }
}

async function buildEmailContext(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
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

  return { tenant, logo, buttonColor, options };
}

interface SendTemplatedEmailParams {
  to: string;
  templateName: EmailTemplateName;
  /**
   * Mailgun-side template name preserved for tenants still rendering on the
   * provider. Passed through to `EmailServiceAdapter.send()` regardless of
   * whether we render in-process.
   */
  legacyTemplate: string;
  fallbackSubject: string;
  fallbackHtml: string;
  tenant: { id: string; friendly_name: string; support_url?: string };
  branding: { logo: string; primary_color: string };
  url?: string;
  code?: string;
  data: Record<string, string>;
}

/**
 * Resolve the tenant's email template (override or bundled default), render
 * with Liquid, and dispatch via `sendEmail`. Falls back to caller-provided
 * inline subject/html when no template resolves. Returns false when the
 * tenant has explicitly disabled the template (caller should treat the send
 * as suppressed).
 */
async function sendTemplatedEmail(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: SendTemplatedEmailParams,
): Promise<boolean> {
  const provider = await ctx.env.data.emailProviders.get(ctx.var.tenant_id);
  const fallbackFrom =
    provider?.default_from_address || `login@${ctx.env.ISSUER}`;

  const vars: Record<string, unknown> = {
    ...params.data,
    tenant: {
      id: params.tenant.id,
      friendly_name: params.tenant.friendly_name,
      support_url: params.tenant.support_url || "",
    },
    branding: {
      logo: params.branding.logo,
      primary_color: params.branding.primary_color,
    },
    url: params.url,
    code: params.code,
  };

  const result = await renderEmailTemplate(
    ctx,
    params.templateName,
    vars,
    fallbackFrom,
  );

  if (result.kind === "disabled") {
    return false;
  }

  const subject =
    result.kind === "rendered" ? result.email.subject : params.fallbackSubject;
  const html =
    result.kind === "rendered" ? result.email.html : params.fallbackHtml;
  const from = result.kind === "rendered" ? result.email.from : fallbackFrom;

  await sendEmail(ctx, {
    to: params.to,
    subject,
    html,
    template: params.legacyTemplate,
    data: params.data,
    from,
  });
  return true;
}

export async function sendResetPassword(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  to: string,
  // auth0 just has a ticket, but we have a code and a state
  code: string,
  state?: string,
  language?: string,
) {
  const { tenant, logo, buttonColor, options } = await buildEmailContext(
    ctx,
    language,
  );

  // the auth0 link looks like this:  https://auth.sesamy.dev/u/reset-verify?ticket={ticket}#
  const passwordResetUrl = `${getUniversalLoginUrl(ctx.env)}reset-password?state=${state}&code=${code}`;

  const data: Record<string, string> = {
    vendorName: tenant.friendly_name,
    logo,
    passwordResetUrl,
    supportUrl: tenant.support_url || "https://support.sesamy.com",
    buttonColor,
    password_reset_title: t("password_reset_title", options),
    passwordResetTitle: t("password_reset_title", options),
    reset_password_email_click_to_reset: t(
      "reset_password_email_click_to_reset",
      options,
    ),
    resetPasswordEmailClickToReset: t(
      "reset_password_email_click_to_reset",
      options,
    ),
    reset_password_email_reset: t("reset_password_email_reset", options),
    resetPasswordEmailReset: t("reset_password_email_reset", options),
    support_info: t("support_info", options),
    supportInfo: t("support_info", options),
    contact_us: t("contact_us", options),
    contactUs: t("contact_us", options),
    copyright: t("copyright", options),
    tenantName: tenant.friendly_name,
    tenantId: tenant.id,
  };

  await sendTemplatedEmail(ctx, {
    to,
    templateName: "reset_email",
    legacyTemplate: "auth-password-reset",
    fallbackSubject: t("reset_password_title", options),
    fallbackHtml: `Click here to reset your password: ${passwordResetUrl}`,
    tenant,
    branding: { logo, primary_color: buttonColor },
    url: passwordResetUrl,
    data,
  });

  // Log the password reset request
  logMessage(ctx, tenant.id, {
    type: LogTypes.SUCCESS_CHANGE_PASSWORD_REQUEST,
    description: to,
  });
}

export async function sendResetPasswordCode(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  to: string,
  code: string,
  language?: string,
) {
  const { tenant, logo, buttonColor, options } = await buildEmailContext(
    ctx,
    language,
  );

  const data: Record<string, string> = {
    code,
    vendorName: tenant.friendly_name,
    logo,
    supportUrl: tenant.support_url || "https://support.sesamy.com",
    buttonColor,
    welcomeToYourAccount: t("password_reset_title", options),
    password_reset_title: t("password_reset_title", options),
    linkEmailClickToLogin: t("reset_password_email_click_to_reset", options),
    reset_password_email_click_to_reset: t(
      "reset_password_email_click_to_reset",
      options,
    ),
    linkEmailLogin: t("reset_password_email_reset", options),
    reset_password_email_reset: t("reset_password_email_reset", options),
    linkEmailOrEnterCode: t("link_email_or_enter_code", {
      ...options,
      code,
    }),
    codeValid30Mins: t("code_valid_30_minutes", options),
    code_valid_30_minutes: t("code_valid_30_minutes", options),
    support_info: t("support_info", options),
    supportInfo: t("support_info", options),
    contact_us: t("contact_us", options),
    contactUs: t("contact_us", options),
    copyright: t("copyright", options),
  };

  await sendTemplatedEmail(ctx, {
    to,
    templateName: "reset_email_by_code",
    legacyTemplate: "auth-code",
    fallbackSubject: t("reset_password_title", options),
    fallbackHtml: `Your password reset code is: ${code}`,
    tenant,
    branding: { logo, primary_color: buttonColor },
    code,
    data,
  });

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
    const data: Record<string, string> = {
      code,
      vendorName: tenant.friendly_name,
      logo,
      supportUrl: tenant.support_url || "",
      buttonColor,
      welcomeToYourAccount: t("welcome_to_your_account", options),
      welcome_to_your_account: t("welcome_to_your_account", options),
      linkEmailClickToLogin: t("link_email_click_to_login", options),
      link_email_click_to_login: t("link_email_click_to_login", options),
      linkEmailLogin: t("link_email_login", options),
      link_email_login: t("link_email_login", options),
      linkEmailOrEnterCode: t("link_email_or_enter_code", options),
      link_email_or_enter_code: t("link_email_or_enter_code", options),
      codeValid30Mins: t("code_valid_30_minutes", options),
      code_valid_30_minutes: t("code_valid_30_minutes", options),
      code_email_subject: t("code_email_subject", options),
      supportInfo: t("support_info", options),
      support_info: t("support_info", options),
      contactUs: t("contact_us", options),
      contact_us: t("contact_us", options),
      copyright: t("copyright", options),
    };

    await sendTemplatedEmail(ctx, {
      to,
      templateName: "verify_email_by_code",
      legacyTemplate: "auth-code",
      fallbackSubject: t("code_email_subject", options),
      fallbackHtml: `Click here to validate your email: ${getUniversalLoginUrl(ctx.env)}validate-email`,
      tenant,
      branding: { logo, primary_color: buttonColor },
      code,
      data,
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
    const data: Record<string, string> = {
      code,
      vendorName: tenant.friendly_name,
      logo,
      supportUrl: tenant.support_url || "",
      magicLink: magicLink.toString(),
      buttonColor,
      welcomeToYourAccount: t("welcome_to_your_account", options),
      welcome_to_your_account: t("welcome_to_your_account", options),
      linkEmailClickToLogin: t("link_email_click_to_login", options),
      link_email_click_to_login: t("link_email_click_to_login", options),
      linkEmailLogin: t("link_email_login", options),
      link_email_login: t("link_email_login", options),
      linkEmailOrEnterCode: t("link_email_or_enter_code", options),
      link_email_or_enter_code: t("link_email_or_enter_code", options),
      codeValid30Mins: t("code_valid_30_minutes", options),
      code_valid_30_minutes: t("code_valid_30_minutes", options),
      code_email_subject: t("code_email_subject", options),
      supportInfo: t("support_info", options),
      support_info: t("support_info", options),
      contactUs: t("contact_us", options),
      contact_us: t("contact_us", options),
      copyright: t("copyright", options),
    };

    await sendTemplatedEmail(ctx, {
      to,
      templateName: "verify_email",
      legacyTemplate: "auth-link",
      fallbackSubject: t("code_email_subject", options),
      fallbackHtml: `Click here to validate your email: ${magicLink.toString()}`,
      tenant,
      branding: { logo, primary_color: buttonColor },
      url: magicLink.toString(),
      code,
      data,
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

  const emailValidationUrl = `${getUniversalLoginUrl(ctx.env)}validate-email`;

  const data: Record<string, string> = {
    vendorName: tenant.friendly_name,
    logo,
    emailValidationUrl,
    supportUrl: tenant.support_url || "https://support.sesamy.com",
    buttonColor,
    welcomeToYourAccount: t("welcome_to_your_account", options),
    welcome_to_your_account: t("welcome_to_your_account", options),
    verifyEmailVerify: t("verify_email_verify", options),
    verify_email_verify: t("verify_email_verify", options),
    link_email_click_to_login: t("verify_email_verify", options),
    link_email_login: t("verify_email_verify", options),
    supportInfo: t("support_info", options),
    support_info: t("support_info", options),
    contactUs: t("contact_us", options),
    contact_us: t("contact_us", options),
    copyright: t("copyright", options),
  };

  await sendTemplatedEmail(ctx, {
    to: user.email,
    templateName: "verify_email",
    legacyTemplate: "auth-verify-email",
    fallbackSubject: t("welcome_to_your_account", options),
    fallbackHtml: `Click here to validate your email: ${emailValidationUrl}`,
    tenant,
    branding: { logo, primary_color: buttonColor },
    url: emailValidationUrl,
    data,
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

  const data: Record<string, string> = {
    vendorName: tenant.friendly_name,
    logo,
    signupUrl,
    setPassword: t("set_password", options),
    registerPasswordAccount: t("register_password_account", options),
    clickToSignUpDescription: t("click_to_sign_up_description", options),
    supportUrl: tenant.support_url || "https://support.sesamy.com",
    buttonColor,
    welcomeToYourAccount: t("welcome_to_your_account", options),
    welcome_to_your_account: t("welcome_to_your_account", options),
    verifyEmailVerify: t("verify_email_verify", options),
    verify_email_verify: t("verify_email_verify", options),
    link_email_click_to_login: t("click_to_sign_up_description", options),
    link_email_login: t("set_password", options),
    supportInfo: t("support_info", options),
    support_info: t("support_info", options),
    contactUs: t("contact_us", options),
    contact_us: t("contact_us", options),
    copyright: t("copyright", options),
  };

  await sendTemplatedEmail(ctx, {
    to,
    templateName: "verify_email",
    legacyTemplate: "auth-pre-signup-verification",
    fallbackSubject: t("register_password_account", options),
    fallbackHtml: `Click here to register: ${signupUrl}`,
    tenant,
    branding: { logo, primary_color: buttonColor },
    url: signupUrl,
    data,
  });
}
