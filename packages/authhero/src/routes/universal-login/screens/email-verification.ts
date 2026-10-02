/**
 * Email verification screens for logins blocked on an unverified email
 * (client `email_validation: "enforced"`). Which one is shown follows the
 * database connection's `attributes.email.verification_method`:
 *
 * - "code" (default): email-verification-code — enter the emailed code and
 *   the same login session continues.
 * - "link": email-verification-link-sent — the emailed link verifies the
 *   address and returns the user to the login screen.
 *
 * Corresponds to: /u2/login/email-verification and
 * /u2/login/email-verification-sent
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import {
  Strategy,
  StrategyType,
  isDatabaseConnectionStrategy,
} from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { getLoginPath } from "./types";
import { escapeHtml } from "../sanitization-utils";
import { createTranslation } from "../../../i18n";
import { createFrontChannelAuthResponse } from "../../../authentication-flows/common";
import {
  LoginEmailVerification,
  getEmailVerificationMethod,
  sendLoginEmailVerificationCode,
  verifyLoginEmailCode,
} from "../../../authentication-flows/email-verification";
import { sendValidateEmailAddress } from "../../../emails";
import { getUsernamePasswordUser } from "../../../utils/username-password-provider";
import { getIssuer } from "../../../variables";

function maskEmail(email: string | undefined): string {
  if (!email || !email.includes("@")) return "";
  return email.replace(/(.{2})(.*)(@.*)/, "$1***$3");
}

function getLanguage(uiLocales?: string) {
  return uiLocales?.split(" ")?.map((locale) => locale.split("-")[0])[0];
}

/**
 * The verification options a u2 password login passes to `loginWithPassword`.
 * The link method returns the user to this session's login screen.
 */
export async function getLoginEmailVerification(
  context: ScreenContext,
): Promise<LoginEmailVerification> {
  const method = getEmailVerificationMethod(context.client);
  if (method === "code") {
    return { method };
  }

  const { ctx, state } = context;
  const loginPath = (await getLoginPath(context)).replace(/^\//, "");
  const resultUrl = new URL(
    loginPath,
    getIssuer(ctx.env, ctx.var.custom_domain),
  );
  resultUrl.searchParams.set("state", state);
  return { method, resultUrl: resultUrl.toString() };
}

/**
 * The screen to show after a u2 password login threw EMAIL_NOT_VERIFIED. The
 * verification email has already been sent by the password grant.
 */
export async function emailVerificationRequiredScreen(
  context: ScreenContext,
  email: string | undefined,
): Promise<ScreenResult> {
  const nextContext = {
    ...context,
    errors: undefined,
    messages: undefined,
    data: { ...context.data, email },
  };
  return getEmailVerificationMethod(context.client) === "code"
    ? emailVerificationCodeScreen(nextContext)
    : emailVerificationLinkSentScreen(nextContext);
}

/**
 * Re-send the verification email for the user of this login session. Only
 * sends when the session's user exists and is still unverified; the caller
 * shows the same confirmation either way so the screen doesn't reveal it.
 */
async function resendVerification(context: ScreenContext): Promise<void> {
  const { ctx, client, state } = context;
  const loginSession = await ctx.env.data.loginSessions.get(
    client.tenant.id,
    state,
  );
  const username = loginSession?.authParams?.username;
  if (!loginSession || !username) {
    throw new Error("Session expired");
  }

  const user = await getUsernamePasswordUser({
    env: ctx.env,
    tenant_id: client.tenant.id,
    username,
  });
  if (!user?.email || user.email_verified) {
    return;
  }

  const language = getLanguage(loginSession.authParams.ui_locales);
  const verification = await getLoginEmailVerification(context);
  if (verification.method === "code") {
    const passwordConnection = client.connections.find((c) =>
      isDatabaseConnectionStrategy(c.strategy),
    );
    await sendLoginEmailVerificationCode(ctx, {
      client,
      user,
      loginSession,
      connection: passwordConnection?.name ?? Strategy.USERNAME_PASSWORD,
      language,
    });
  } else {
    await sendValidateEmailAddress(ctx, user, language, {
      resultUrl: verification.resultUrl,
    });
  }
}

export async function emailVerificationCodeScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, errors, messages, data, customText, routePrefix } =
    context;

  const locale = context.language || "en";
  const { m } = createTranslation(
    "email-verification",
    "email-verification-code",
    locale,
    customText,
  );
  const { m: common } = createTranslation(
    "common",
    "common",
    locale,
    customText,
  );

  const maskedEmail = maskEmail(data?.email as string | undefined);
  const description = maskedEmail
    ? m.description({ email: `<strong>${escapeHtml(maskedEmail)}</strong>` })
    : m.defaultDescription();

  const components: FormNodeComponent[] = [
    {
      id: "code",
      type: "TEXT",
      category: "FIELD",
      visible: true,
      label: m.codeLabel(),
      config: {
        placeholder: m.codePlaceholder(),
        max_length: 6,
      },
      required: true,
      order: 0,
      messages: errors?.code
        ? [{ text: errors.code, type: "error" as const }]
        : undefined,
    },
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: { text: m.buttonText() },
      order: 1,
    },
    {
      id: "resend",
      type: "RESEND_BUTTON",
      category: "BLOCK",
      visible: true,
      config: { text: m.resendText() },
      order: 2,
    },
  ];

  const screen: UiScreen = {
    name: "email-verification-code",
    action: `${routePrefix}/login/email-verification?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    description,
    components,
    messages: messages?.map((msg) => ({ text: msg.text, type: msg.type })),
    links: [
      {
        id: "back",
        text: "",
        linkText: common.backText(),
        href: `${await getLoginPath(context)}?state=${encodeURIComponent(state)}`,
      },
    ],
  };

  return { screen, branding };
}

export async function emailVerificationLinkSentScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, messages, data, customText, routePrefix } = context;

  const locale = context.language || "en";
  const { m } = createTranslation(
    "email-verification",
    "email-verification-link-sent",
    locale,
    customText,
  );
  const { m: common } = createTranslation(
    "common",
    "common",
    locale,
    customText,
  );

  const maskedEmail = maskEmail(data?.email as string | undefined);
  const description = maskedEmail
    ? m.description({ email: `<strong>${escapeHtml(maskedEmail)}</strong>` })
    : m.defaultDescription();

  const components: FormNodeComponent[] = [
    {
      id: "resend",
      type: "RESEND_BUTTON",
      category: "BLOCK",
      visible: true,
      config: { text: m.resendText() },
      order: 0,
    },
  ];

  const screen: UiScreen = {
    name: "email-verification-link-sent",
    action: `${routePrefix}/login/email-verification-sent?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    description,
    components,
    messages: messages?.map((msg) => ({ text: msg.text, type: msg.type })),
    links: [
      {
        id: "back",
        text: "",
        linkText: common.backText(),
        href: `${await getLoginPath(context)}?state=${encodeURIComponent(state)}`,
      },
    ],
  };

  return { screen, branding };
}

export const emailVerificationCodeScreenDefinition: ScreenDefinition = {
  id: "email-verification-code",
  name: "Email Verification Code",
  description: "Enter the code that verifies the user's email during login",
  handler: {
    get: emailVerificationCodeScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;

      const locale = context.language || "en";
      const { m } = createTranslation(
        "email-verification",
        "email-verification-code",
        locale,
        context.customText,
      );

      const withError = async (errorMessage: string) => ({
        error: errorMessage,
        screen: await emailVerificationCodeScreen({
          ...context,
          errors: { code: errorMessage },
        }),
      });

      if (data.action === "resend") {
        try {
          await resendVerification(context);
        } catch (err) {
          if (err instanceof Error && err.message === "Session expired") {
            return withError(m.sessionExpired());
          }
          console.error("Failed to resend email verification code:", err);
          return {
            error: m.resendFailed(),
            screen: await emailVerificationCodeScreen({
              ...context,
              messages: [{ text: m.resendFailed(), type: "error" as const }],
            }),
          };
        }
        return {
          screen: await emailVerificationCodeScreen({
            ...context,
            messages: [{ text: m.resendSuccess(), type: "success" as const }],
          }),
        };
      }

      const code = (data.code as string)?.trim();
      if (!code) {
        return withError(m.noCode());
      }

      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );
      if (!loginSession) {
        return withError(m.sessionExpired());
      }

      const result = await verifyLoginEmailCode(
        ctx,
        client,
        loginSession,
        code,
      );
      if (!result.ok) {
        return withError(
          result.reason === "rate_limited"
            ? m.tooManyAttempts()
            : m.invalidCode(),
        );
      }

      ctx.set("connection", result.connection);
      ctx.set("user_id", result.user.user_id);

      const response = await createFrontChannelAuthResponse(ctx, {
        client,
        authParams: loginSession.authParams,
        user: result.user,
        loginSession,
        authConnection: result.connection,
        authStrategy: {
          strategy: Strategy.USERNAME_PASSWORD,
          strategy_type: StrategyType.DATABASE,
        },
      });

      const location = response.headers.get("location");
      const cookies = response.headers.getSetCookie?.() || [];
      if (location) {
        return { redirect: location, cookies };
      }
      return { response };
    },
  },
};

export const emailVerificationLinkSentScreenDefinition: ScreenDefinition = {
  id: "email-verification-link-sent",
  name: "Email Verification Link Sent",
  description: "Tells the user a verification link was emailed during login",
  handler: {
    get: emailVerificationLinkSentScreen,
    post: async (context) => {
      const locale = context.language || "en";
      const { m } = createTranslation(
        "email-verification",
        "email-verification-link-sent",
        locale,
        context.customText,
      );

      try {
        await resendVerification(context);
      } catch (err) {
        console.error("Failed to resend email verification link:", err);
        return {
          error: m.resendFailed(),
          screen: await emailVerificationLinkSentScreen({
            ...context,
            messages: [{ text: m.resendFailed(), type: "error" as const }],
          }),
        };
      }
      return {
        screen: await emailVerificationLinkSentScreen({
          ...context,
          messages: [{ text: m.resendSuccess(), type: "success" as const }],
        }),
      };
    },
  },
};
