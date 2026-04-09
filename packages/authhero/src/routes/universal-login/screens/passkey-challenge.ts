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
import {
  LogTypes,
  Strategy,
  StrategyType,
} from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { createTranslation } from "../../../i18n";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { createFrontChannelAuthResponse } from "../../../authentication-flows/common";
import { logMessage } from "../../../helpers/logging";
import {
  getRpId,
  getExpectedOrigin,
  buildWebAuthnAuthenticationScript,
  buildWebAuthnAuthenticationCeremony,
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
  let ceremony: ReturnType<typeof buildWebAuthnAuthenticationCeremony> | undefined;
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

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    userVerification: "preferred",
    timeout: 60000,
  });

  const loginSession = await ctx.env.data.loginSessions.get(
    client.tenant.id,
    state,
  );
  if (!loginSession) return undefined;

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

      const stateData = loginSession.state_data
        ? JSON.parse(loginSession.state_data)
        : {};
      const expectedChallenge = stateData.webauthn_challenge as string;

      if (!expectedChallenge) {
        const optionsJSON = await generateFreshAuthenticationOptions(context);
        return {
          screen: await passkeyChallengeScreen(context, {
            optionsJSON,
            errorMessage: "Challenge expired. Please try again.",
          }),
        };
      }

      let credential;
      try {
        credential = JSON.parse(credentialJson);
      } catch {
        const optionsJSON = await generateFreshAuthenticationOptions(context);
        return {
          screen: await passkeyChallengeScreen(context, {
            optionsJSON,
            errorMessage: m.errorMessage(),
          }),
        };
      }

      // Look up the authentication method by credential ID
      const authMethod = await ctx.env.data.authenticationMethods.getByCredentialId(
        client.tenant.id,
        credential.id,
      );

      if (!authMethod || !authMethod.public_key || !authMethod.confirmed) {
        logMessage(ctx, client.tenant.id, {
          type: LogTypes.FAILED_LOGIN,
          description: "Passkey not found or not confirmed",
        });
        const optionsJSON = await generateFreshAuthenticationOptions(context);
        return {
          screen: await passkeyChallengeScreen(context, {
            optionsJSON,
            errorMessage: m.errorMessage(),
          }),
        };
      }

      const rpId = getRpId(ctx);
      const expectedOrigin = getExpectedOrigin(ctx);

      try {
        // Convert stored base64url public key back to Uint8Array
        const publicKeyBytes = Buffer.from(authMethod.public_key, "base64url");

        const verification = await verifyAuthenticationResponse({
          response: credential,
          expectedChallenge,
          expectedOrigin,
          expectedRPID: rpId,
          credential: {
            id: authMethod.credential_id!,
            publicKey: new Uint8Array(publicKeyBytes),
            counter: authMethod.sign_count || 0,
            transports: (authMethod.transports || []) as AuthenticatorTransport[],
          },
          requireUserVerification: false,
        });

        if (!verification.verified) {
          logMessage(ctx, client.tenant.id, {
            type: LogTypes.FAILED_LOGIN,
            description: "Passkey verification failed",
          });
          const optionsJSON = await generateFreshAuthenticationOptions(context);
          return {
            screen: await passkeyChallengeScreen(context, {
              optionsJSON,
              errorMessage: m.errorMessage(),
            }),
          };
        }

        // Update sign count for clone detection
        await ctx.env.data.authenticationMethods.update(
          client.tenant.id,
          authMethod.id,
          {
            sign_count: verification.authenticationInfo.newCounter,
          },
        );

        // Get the user associated with this passkey
        const user = await ctx.env.data.users.get(
          client.tenant.id,
          authMethod.user_id,
        );

        if (!user) {
          logMessage(ctx, client.tenant.id, {
            type: LogTypes.FAILED_LOGIN,
            description: "User not found for passkey",
          });
          const optionsJSON = await generateFreshAuthenticationOptions(context);
          return {
            screen: await passkeyChallengeScreen(context, {
              optionsJSON,
              errorMessage: m.errorMessage(),
            }),
          };
        }

        // Resolve to primary user if linked
        const primaryUser = user.linked_to
          ? await ctx.env.data.users.get(client.tenant.id, user.linked_to)
          : user;

        if (!primaryUser) {
          const optionsJSON = await generateFreshAuthenticationOptions(context);
          return {
            screen: await passkeyChallengeScreen(context, {
              optionsJSON,
              errorMessage: m.errorMessage(),
            }),
          };
        }

        logMessage(ctx, client.tenant.id, {
          type: LogTypes.SUCCESS_LOGIN,
          description: "Passkey authentication successful",
          userId: primaryUser.user_id,
        });

        // Set mfa_verified to bypass MFA - passkeys provide multi-factor assurance
        await ctx.env.data.loginSessions.update(client.tenant.id, state, {
          user_id: primaryUser.user_id,
          state_data: JSON.stringify({
            ...stateData,
            mfa_verified: true,
          }),
        });

        // Complete the login
        const result = await createFrontChannelAuthResponse(ctx, {
          authParams: loginSession.authParams,
          user: primaryUser,
          client,
          loginSession: {
            ...loginSession,
            user_id: primaryUser.user_id,
          },
          authConnection: user.connection || Strategy.USERNAME_PASSWORD,
          authStrategy: {
            strategy: "passkey",
            strategy_type: StrategyType.DATABASE,
          },
        });

        const location = result.headers.get("location");
        const cookies = result.headers.getSetCookie?.() || [];
        if (location) return { redirect: location, cookies };
        return { response: result };
      } catch (err) {
        logMessage(ctx, client.tenant.id, {
          type: LogTypes.FAILED_LOGIN,
          description: `Passkey authentication error: ${err instanceof Error ? err.message : "unknown"}`,
        });

        const optionsJSON = await generateFreshAuthenticationOptions(context);
        return {
          screen: await passkeyChallengeScreen(context, {
            optionsJSON,
            errorMessage: m.errorMessage(),
          }),
        };
      }
    },
  },
};
