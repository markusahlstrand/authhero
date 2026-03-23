/**
 * MFA TOTP Challenge screen - for verifying authenticator app MFA code
 *
 * Corresponds to: /u2/mfa/totp-challenge
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { LoginSessionState, LogTypes } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { createTranslation } from "../../../i18n";
import { verifyTotpCode } from "../../../authentication-flows/mfa";
import {
  transitionLoginSession,
  LoginSessionEventType,
} from "../../../state-machines/login-session";
import { createFrontChannelAuthResponse } from "../../../authentication-flows/common";
import { logMessage } from "../../../helpers/logging";

/**
 * Create the mfa-totp-challenge screen
 */
export async function mfaTotpChallengeScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, errors, customText, routePrefix } = context;

  const locale = context.language || "en";
  const { m } = createTranslation(
    "mfa-otp",
    "mfa-totp-challenge",
    locale,
    customText,
  );

  const components: FormNodeComponent[] = [
    {
      id: "code",
      type: "TEXT",
      category: "FIELD",
      visible: true,
      label: m.codePlaceholder(),
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
      config: {
        text: m.continueButtonText(),
      },
      order: 1,
    },
  ];

  const screen: UiScreen = {
    name: "mfa-totp-challenge",
    action: `${routePrefix}/mfa/totp-challenge?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    description: m.description(),
    components,
  };

  return {
    screen,
    branding,
  };
}

/**
 * Get the TOTP secret for the current MFA enrollment from the login session state_data
 */
async function getEnrollmentSecret(
  ctx: ScreenContext["ctx"],
  tenantId: string,
  loginSession: { state_data?: string | null; user_id?: string | null },
): Promise<string | undefined> {
  const stateData = loginSession.state_data
    ? JSON.parse(loginSession.state_data)
    : {};

  if (stateData.mfaEnrollmentId) {
    const enrollment = await ctx.env.data.mfaEnrollments.get(
      tenantId,
      stateData.mfaEnrollmentId,
    );
    if (enrollment?.totp_secret) {
      return enrollment.totp_secret;
    }
  }

  if (loginSession.user_id) {
    const enrollments = await ctx.env.data.mfaEnrollments.list(
      tenantId,
      loginSession.user_id,
    );
    const totpEnrollment = enrollments.find(
      (e) => e.type === "totp" && e.confirmed,
    );
    if (totpEnrollment?.totp_secret) {
      return totpEnrollment.totp_secret;
    }
  }

  return undefined;
}

/**
 * Screen definition for the mfa-totp-challenge screen
 */
export const mfaTotpChallengeScreenDefinition: ScreenDefinition = {
  id: "mfa-totp-challenge",
  name: "MFA TOTP Challenge",
  description: "Authenticator app code verification screen for MFA",
  handler: {
    get: mfaTotpChallengeScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const code = (data.code as string)?.trim();

      const locale = context.language || "en";
      const { m } = createTranslation(
        "mfa-otp",
        "mfa-totp-challenge",
        locale,
        context.customText,
      );

      // Validate code is provided
      if (!code) {
        const errorMessage = m["invalid-code"]();
        return {
          error: errorMessage,
          screen: await mfaTotpChallengeScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }

      // Get the login session
      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (
        !loginSession ||
        !loginSession.user_id ||
        loginSession.state !== LoginSessionState.AWAITING_MFA
      ) {
        const errorMessage = m["transaction-not-found"]();
        return {
          error: errorMessage,
          screen: await mfaTotpChallengeScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }

      logMessage(ctx, client.tenant.id, {
        type: LogTypes.SECOND_FACTOR_STARTED,
        description: "MFA TOTP verification started",
        userId: loginSession.user_id,
      });

      // Get the TOTP secret
      const totpSecret = await getEnrollmentSecret(
        ctx,
        client.tenant.id,
        loginSession,
      );

      if (!totpSecret) {
        const errorMessage = m["transaction-not-found"]();
        return {
          error: errorMessage,
          screen: await mfaTotpChallengeScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }

      // Verify the TOTP code
      let valid: boolean;
      try {
        valid = await verifyTotpCode(totpSecret, code);
      } catch (err) {
        logMessage(ctx, client.tenant.id, {
          type: LogTypes.MFA_AUTH_FAILED,
          description: `MFA TOTP verification error: ${err instanceof Error ? err.message : "unknown error"}`,
          userId: loginSession.user_id,
        });

        const errorMessage = m.unexpectedError();
        return {
          error: errorMessage,
          screen: await mfaTotpChallengeScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }

      if (!valid) {
        logMessage(ctx, client.tenant.id, {
          type: LogTypes.MFA_AUTH_FAILED,
          description: "MFA TOTP verification failed - invalid code",
          userId: loginSession.user_id,
        });

        const errorMessage = m["invalid-code"]();
        return {
          error: errorMessage,
          screen: await mfaTotpChallengeScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }

      try {
        const stateData = loginSession.state_data
          ? JSON.parse(loginSession.state_data)
          : {};

        // If enrolling, confirm the enrollment
        if (stateData.mfaEnrollmentId) {
          const enrollment = await ctx.env.data.mfaEnrollments.get(
            client.tenant.id,
            stateData.mfaEnrollmentId,
          );

          if (enrollment && !enrollment.confirmed) {
            await ctx.env.data.mfaEnrollments.update(
              client.tenant.id,
              enrollment.id,
              { confirmed: true },
            );

            logMessage(ctx, client.tenant.id, {
              type: LogTypes.MFA_ENROLLMENT_COMPLETE,
              description: "MFA TOTP enrollment completed",
              userId: loginSession.user_id,
            });
          }
        }

        // Transition from AWAITING_MFA back to AUTHENTICATED
        const currentState =
          loginSession.state || LoginSessionState.AWAITING_MFA;
        const { state: newState } = transitionLoginSession(
          currentState as LoginSessionState,
          { type: LoginSessionEventType.COMPLETE_MFA },
        );

        logMessage(ctx, client.tenant.id, {
          type: LogTypes.MFA_AUTH_SUCCESS,
          description: "MFA TOTP verification succeeded",
          userId: loginSession.user_id,
        });

        // Persist the MFA completion
        await ctx.env.data.loginSessions.update(client.tenant.id, state, {
          state: newState,
          state_data: JSON.stringify({
            ...stateData,
            mfa_verified: true,
          }),
        });

        // Get user to continue the auth flow
        const user = await ctx.env.data.users.get(
          client.tenant.id,
          loginSession.user_id,
        );

        if (!user) {
          throw new Error("User not found");
        }

        // Continue the authentication flow
        const result = await createFrontChannelAuthResponse(ctx, {
          authParams: loginSession.authParams,
          user,
          client,
          loginSession,
          authConnection: loginSession.auth_connection,
        });

        const location = result.headers.get("location");
        const cookies = result.headers.getSetCookie?.() || [];
        if (location) {
          return { redirect: location, cookies };
        }
        return { response: result };
      } catch {
        const errorMessage = m.unexpectedError();
        return {
          error: errorMessage,
          screen: await mfaTotpChallengeScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }
    },
  },
};
