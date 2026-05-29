import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute, getLoginStrategy } from "./common";
import IdentifierPage from "../../components/IdentifierPage";
import {
  getPrimaryUserByProvider,
  getPrimaryUserByEmail,
} from "../../helpers/users";
import { getPrimaryUsernamePasswordUser } from "../../utils/username-password-provider";
import { validateSignupEmail } from "../../hooks";
import { logMessage } from "../../helpers/logging";
import {
  LogTypes,
  Strategy,
  getConnectionIdentifierConfig,
} from "@authhero/adapter-interfaces";
import i18next from "i18next";
import generateOTP from "../../utils/otp";
import { sendCode, sendLink } from "../../emails";
import { OTP_EXPIRATION_TIME } from "../../constants";
import { getConnectionFromIdentifier } from "../../utils/username";
import { findHrdConnection } from "../../helpers/hrd";
import { connectionAuth } from "../../authentication-flows/connection";
import { HTTPException } from "hono/http-exception";

import { DefaultUserAgentDetector } from "../../client/user-agent-detector";

import { defineRoute } from "../../utils/define-route";
export type SendType = "link" | "code";

/**
 * Detect if the request is from an embedded browser
 */
function detectEmbeddedBrowser(userAgent: string): {
  isEmbedded: boolean;
  browserName?: string;
} {
  const detector = new DefaultUserAgentDetector();
  const userAgentInfo = detector.parse(userAgent);
  return {
    isEmbedded: userAgentInfo.isEmbedded ?? false,
    browserName: userAgentInfo.browser?.name,
  };
}
const getRoot = defineRoute({
  route: createRoute({
    tags: ["login"],
    method: "get",
    path: "/",
    request: {
      query: z.object({
        state: z.string().openapi({
          description: "The state parameter from the authorization request",
        }),
        impersonation: z.string().optional(),
        error: z.string().optional().openapi({
          description: "Error code from failed authentication",
        }),
        error_description: z.string().optional().openapi({
          description: "Human-readable error description",
        }),
      }),
    },
    responses: {
      200: {
        description: "Response",
      },
    },
  }),
  handler: async (ctx) => {
    const { state, error, error_description } = ctx.req.valid("query");

    const { theme, branding, loginSession, client } = await initJSXRoute(
      ctx,
      state,
    );

    // Detect embedded browser from User-Agent
    const userAgent = ctx.req.header("user-agent") || "";
    const { isEmbedded, browserName } = detectEmbeddedBrowser(userAgent);

    // Build error message: prefer error_description over error code
    const errorMessage = error_description || error;

    return ctx.html(
      <IdentifierPage
        theme={theme}
        branding={branding}
        loginSession={loginSession}
        client={client}
        email={loginSession.authParams.username}
        isEmbedded={isEmbedded}
        browserName={browserName}
        error={errorMessage}
      />,
    );
  },
});

const postRoot = defineRoute({
  route: createRoute({
    tags: ["login"],
    method: "post",
    path: "/",
    request: {
      query: z.object({
        state: z.string().openapi({
          description: "The state parameter from the authorization request",
        }),
      }),
      body: {
        content: {
          "application/x-www-form-urlencoded": {
            schema: z.object({
              username: z.string().transform((u) => u.toLowerCase()),
              login_selection: z.enum(["code", "password"]).optional(),
            }),
          },
        },
      },
    },
    responses: {
      400: {
        description: "Error response",
      },
      302: {
        description: "Redirect to enter code or password",
      },
    },
  }),
  handler: async (ctx) => {
    const { env } = ctx;
    const { state } = ctx.req.valid("query");
    const params = ctx.req.valid("form");
    ctx.set("body", params);
    ctx.set("username", params.username);

    const { client, loginSession, theme, branding } = await initJSXRoute(
      ctx,
      state,
    );
    ctx.set("client_id", client.client_id);

    // Detect embedded browser from User-Agent
    const userAgent = ctx.req.header("user-agent") || "";
    const { isEmbedded, browserName } = detectEmbeddedBrowser(userAgent);

    const countryCode = ctx.get("countryCode");
    // Note: country code not available in theme or branding schema yet
    const vendorCountryCode = undefined; // Could add to theme.widget or branding later

    const { normalized: username, connectionType } =
      getConnectionFromIdentifier(
        params.username,
        vendorCountryCode || countryCode,
      );

    // Home Realm Discovery: route to enterprise/social IdP by email domain.
    if (connectionType === "email" && username) {
      const hrdConnection = findHrdConnection(
        username,
        client.connections,
        env.STRATEGIES,
      );
      if (hrdConnection) {
        loginSession.authParams.username = username;
        await env.data.loginSessions.update(
          client.tenant.id,
          loginSession.id,
          loginSession,
        );
        return connectionAuth(
          ctx,
          client,
          hrdConnection.name,
          loginSession.authParams,
        );
      }
    }

    // Check if the password connection has username identifier enabled
    const passwordConnection = client.connections.find(
      (c) => c.strategy === Strategy.USERNAME_PASSWORD,
    );
    const identifierConfig = getConnectionIdentifierConfig(passwordConnection);
    const requiresUsername = identifierConfig.usernameIdentifierActive;

    // Validate username length when connectionType is "username"
    if (connectionType === "username" && requiresUsername && username) {
      const minLength = identifierConfig.usernameMinLength;
      const maxLength = identifierConfig.usernameMaxLength;

      if (username.length < minLength || username.length > maxLength) {
        const errorMsg =
          username.length < minLength
            ? `Username must be at least ${minLength} characters`
            : `Username must be ${maxLength} characters or less`;
        return ctx.html(
          <IdentifierPage
            theme={theme}
            branding={branding}
            loginSession={loginSession}
            error={errorMsg}
            email={params.username}
            client={client}
            isEmbedded={isEmbedded}
            browserName={browserName}
          />,
          400,
        );
      }
    }

    // Look up user - for email use getPrimaryUserByEmail (finds any provider);
    // for username use the dual-read helper (accepts auth2 or auth0); for sms
    // use getPrimaryUserByProvider with the literal "sms" provider.
    const user = username
      ? connectionType === "email"
        ? await getPrimaryUserByEmail({
            userAdapter: env.data.users,
            tenant_id: client.tenant.id,
            email: username,
          })
        : connectionType === "username"
          ? await getPrimaryUsernamePasswordUser({
              env,
              tenant_id: client.tenant.id,
              username,
            })
          : await getPrimaryUserByProvider({
              userAdapter: env.data.users,
              tenant_id: client.tenant.id,
              username,
              provider: "sms",
            })
      : null;

    // Allow connection if:
    // 1. There's a matching connection on the client, OR
    // 2. User already exists (can login regardless of how they signed up), OR
    // 3. connectionType is "username" and password connection has username identifier active
    let hasValidConnection =
      client.connections.find((c) => c.strategy === connectionType) ||
      (connectionType === "username" && requiresUsername) ||
      user;

    // Auth0 lazy migration: accept the email even when the user is unknown
    // locally, provided the client has a DB connection flagged
    // `import_mode: true` with upstream credentials configured under
    // `options.configuration`. The password flow will verify against
    // upstream Auth0 and create the user on success.
    let isLazyMigration = false;
    if (!hasValidConnection && connectionType === "email" && username) {
      const hasMigrationConnection = client.connections.some(
        (c) =>
          c.strategy === Strategy.USERNAME_PASSWORD &&
          c.options?.import_mode === true &&
          typeof c.options?.configuration === "object" &&
          c.options.configuration !== null,
      );
      if (hasMigrationConnection) {
        hasValidConnection = true;
        isLazyMigration = true;
      }
    }

    if (!hasValidConnection || !username) {
      return ctx.html(
        <IdentifierPage
          theme={theme}
          branding={branding}
          loginSession={loginSession}
          error="Email is not valid."
          email={params.username}
          client={client}
        />,
        400,
      );
    }
    if (user) {
      ctx.set("user_id", user.user_id);
    }

    // Lazy migration attempts skip the signup gate: the user already exists
    // upstream, so `disable_sign_ups` and signup webhooks (which guard
    // creation of NEW accounts) must not block them. The upstream password
    // check is what ultimately decides whether the migrated account is
    // created locally.
    if (!user && !isLazyMigration) {
      const validation = await validateSignupEmail(
        ctx,
        client,
        ctx.env.data,
        username,
        connectionType,
      );

      if (!validation.allowed) {
        await logMessage(ctx, client.tenant.id, {
          type: LogTypes.FAILED_SIGNUP,
          description: validation.reason || "User account does not exist",
        });

        return ctx.html(
          <IdentifierPage
            theme={theme}
            branding={branding}
            loginSession={loginSession}
            error={i18next.t("user_account_does_not_exist")}
            email={params.username}
            client={client}
            isEmbedded={isEmbedded}
            browserName={browserName}
          />,
          400,
        );
      }
    }

    // Add the username to the state
    loginSession.authParams.username = username;
    await env.data.loginSessions.update(
      client.tenant.id,
      loginSession.id,
      loginSession,
    );

    const loginStrategy = await getLoginStrategy(
      ctx,
      client,
      params.username,
      connectionType,
      params.login_selection,
    );

    if (loginStrategy === "password") {
      return ctx.redirect(`/u/enter-password?state=${state}`);
    }

    let code_id = generateOTP();
    let existingCode = await env.data.codes.get(
      client.tenant.id,
      code_id,
      "otp",
    );

    // This is a slighly hacky way to ensure we don't generate a code that already exists
    while (existingCode) {
      code_id = generateOTP();
      existingCode = await env.data.codes.get(client.tenant.id, code_id, "otp");
    }

    const createdCode = await ctx.env.data.codes.create(client.tenant.id, {
      code_id,
      code_type: "otp",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + OTP_EXPIRATION_TIME).toISOString(),
      redirect_uri: loginSession.authParams.redirect_uri,
    });

    const connection = client.connections.find(
      (p) => p.strategy === connectionType,
    );

    if (!connection) {
      throw new HTTPException(400, {
        message: i18next.t("connection_not_found", {
          connection: connectionType,
        }),
      });
    }

    // Extract language from ui_locales
    const language = loginSession.authParams?.ui_locales
      ?.split(" ")
      ?.map((locale) => locale.split("-")[0])[0];

    if (
      connectionType === "email" &&
      // This is different to how it works in auth0
      connection.options.authentication_method === "magic_link"
    ) {
      await sendLink(ctx, {
        to: username,
        code: createdCode.code_id,
        authParams: loginSession.authParams,
        language,
      });
    } else {
      await sendCode(ctx, {
        to: username,
        code: createdCode.code_id,
        language,
      });
    }

    const otpScreen =
      connectionType === "sms" ? "sms-otp-challenge" : "email-otp-challenge";
    return ctx.redirect(`/u/login/${otpScreen}?state=${state}`);
  },
});

export const identifierRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getRoot, postRoot] as const);
