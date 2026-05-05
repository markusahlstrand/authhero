/**
 * Passkey Challenge screen — WebAuthn authentication ceremony
 *
 * Allows users to sign in using a registered passkey (discoverable credential).
 * This triggers navigator.credentials.get() and verifies the assertion response.
 *
 * GET:  Generates WebAuthn authentication options and renders the challenge screen.
 * POST: Verifies the assertion response, resolves the user, and completes login.
 *
 * Passkey authentication bypasses MFA since it already provides strong
 * multi-factor assurance (possession + biometric/PIN).
 *
 * Corresponds to: /u2/passkey/challenge
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { StrategyType } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { createTranslation } from "../../../i18n";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { createFrontChannelAuthResponse } from "../../../authentication-flows/common";
import {
  getRpId,
  listTenantPasskeys,
  buildWebAuthnAuthenticationScript,
  buildWebAuthnAuthenticationCeremony,
  verifyPasskeyAuthentication,
} from "./passkey-utils";

/**
 * Build the passkey challenge screen UI
 */
async function passkeyChallengeScreen(
  context: ScreenContext,
  extra?: {
    optionsJSON?: string;
    errorMessage?: string;
  },
): Promise<ScreenResult> {
  const { branding, state, routePrefix } = context;

  const locale = context.language || "en";
  const { m: _m } = createTranslation(
    "passkeys",
    "passkey-challenge",
    locale,
    context.customText,
  );
  // Cast to required shape - the Proxy always returns functions for any key
  const m = _m as unknown as {
    [key: string]: (vars?: Record<string, unknown>) => string;
    title: () => string;
    description: () => string;
    errorMessage: () => string;
    cancelLinkText: () => string;
    retryButtonText: () => string;
  };

  const components: FormNodeComponent[] = [];

  if (extra?.errorMessage) {
    components.push({
      id: "error_msg",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<div role="alert" style="color:#dc2626;margin-bottom:12px">${extra.errorMessage}</div>`,
      },
      order: 0,
    });
  }

  // Hidden fields for form submission
  components.push(
    {
      id: "credential-field",
      type: "TEXT" as const,
      category: "FIELD" as const,
      visible: false,
      config: {},
      order: 2,
    },
    {
      id: "action-field",
      type: "TEXT" as const,
      category: "FIELD" as const,
      visible: false,
      config: {},
      order: 3,
    },
  );

  // Retry button (shown when there's an error)
  if (extra?.errorMessage) {
    components.push({
      id: "retry",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: m.retryButtonText(),
      },
      order: 4,
    });
  }

  const screen: UiScreen = {
    name: "passkey-challenge",
    action: `${routePrefix}/passkey/challenge?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    description: extra?.errorMessage ? undefined : m.description(),
    components,
    links: [
      {
        id: "back-to-login",
        text: "",
        linkText: m.cancelLinkText(),
        href: `${routePrefix}/login?state=${encodeURIComponent(state)}`,
      },
    ],
  };

  // Build WebAuthn authentication script and ceremony data
  let extraScript: string | undefined;
  let ceremony:
    | ReturnType<typeof buildWebAuthnAuthenticationCeremony>
    | undefined;
  if (extra?.optionsJSON) {
    extraScript = buildWebAuthnAuthenticationScript(extra.optionsJSON);
    ceremony = buildWebAuthnAuthenticationCeremony(extra.optionsJSON);
  }

  return { screen, branding, extraScript, ceremony };
}

/**
 * Generate fresh WebAuthn authentication options and store the challenge.
 */
async function generateFreshAuthenticationOptions(
  context: ScreenContext,
): Promise<string | undefined> {
  const { ctx, client, state } = context;

  const rpId = getRpId(ctx);

  const loginSession = await ctx.env.data.loginSessions.get(
    client.tenant.id,
    state,
  );
  if (!loginSession) return undefined;

  // When the user is known, scope the picker to this tenant's credentials so
  // passkeys registered under other tenants on the same rpId aren't offered.
  const allowCredentials = loginSession.user_id
    ? (
        await listTenantPasskeys(ctx, client.tenant.id, loginSession.user_id)
      ).map((e) => ({
        id: e.credential_id!,
        transports: (e.transports || []) as AuthenticatorTransport[],
        type: "public-key" as const,
      }))
    : undefined;

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    userVerification: "preferred",
    timeout: 60000,
    ...(allowCredentials ? { allowCredentials } : {}),
  });

  const stateData = loginSession.state_data
    ? JSON.parse(loginSession.state_data)
    : {};

  await ctx.env.data.loginSessions.update(client.tenant.id, state, {
    state_data: JSON.stringify({
      ...stateData,
      webauthn_challenge: options.challenge,
    }),
  });

  return JSON.stringify(options);
}

export const passkeyChallengeScreenDefinition: ScreenDefinition = {
  id: "passkey-challenge",
  name: "Passkey Challenge",
  description: "WebAuthn passkey authentication ceremony",
  handler: {
    get: async (context) => {
      const optionsJSON = await generateFreshAuthenticationOptions(context);
      return passkeyChallengeScreen(context, { optionsJSON });
    },

    post: async (context, data) => {
      const { ctx, client, state } = context;
      const action = data["action-field"] as string;
      const credentialJson = data["credential-field"] as string;

      const locale = context.language || "en";
      const { m: _m2 } = createTranslation(
        "passkeys",
        "passkey-challenge",
        locale,
        context.customText,
      );
      const m = _m2 as unknown as {
        [key: string]: (vars?: Record<string, unknown>) => string;
        errorMessage: () => string;
      };

      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );
      if (!loginSession) {
        return {
          screen: await passkeyChallengeScreen(context, {
            errorMessage: "Session not found",
          }),
        };
      }

      // Handle error from client-side WebAuthn failure
      if (action === "error") {
        const optionsJSON = await generateFreshAuthenticationOptions(context);
        return {
          screen: await passkeyChallengeScreen(context, {
            optionsJSON,
            errorMessage: m.errorMessage(),
          }),
        };
      }

      // Handle authentication
      if (action !== "authenticate" || !credentialJson) {
        const optionsJSON = await generateFreshAuthenticationOptions(context);
        return {
          screen: await passkeyChallengeScreen(context, {
            optionsJSON,
            errorMessage: m.errorMessage(),
          }),
        };
      }

      const result = await verifyPasskeyAuthentication(context, credentialJson);

      if (!result.success) {
        const optionsJSON = await generateFreshAuthenticationOptions(context);
        return {
          screen: await passkeyChallengeScreen(context, {
            optionsJSON,
            errorMessage: m.errorMessage(),
          }),
        };
      }

      // Complete the login
      const authResult = await createFrontChannelAuthResponse(ctx, {
        authParams: result.loginSession.authParams,
        user: result.primaryUser,
        client,
        loginSession: {
          ...result.loginSession,
          user_id: result.primaryUser.user_id,
        },
        authConnection: result.authConnection,
        authStrategy: {
          strategy: "passkey",
          strategy_type: StrategyType.DATABASE,
        },
      });

      const location = authResult.headers.get("location");
      const cookies = authResult.headers.getSetCookie?.() || [];
      if (location) return { redirect: location, cookies };
      return { response: authResult };
    },
  },
};
