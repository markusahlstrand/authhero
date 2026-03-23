/**
 * MFA TOTP Enrollment screen - for setting up authenticator app MFA
 *
 * Corresponds to: /u2/mfa/totp-enrollment
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { LogTypes } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { createTranslation } from "../../../i18n";
import {
  generateTotpSecret,
  createTotpUri,
  verifyTotpCode,
} from "../../../authentication-flows/mfa";
import { logMessage } from "../../../helpers/logging";

/**
 * Create the mfa-totp-enrollment screen
 */
export async function mfaTotpEnrollmentScreen(
  context: ScreenContext,
  extraData?: { totpUri?: string; secretBase32?: string },
): Promise<ScreenResult> {
  const { branding, state, errors, customText, routePrefix } = context;

  const locale = context.language || "en";
  const { m } = createTranslation(
    "mfa-otp",
    "mfa-totp-enrollment",
    locale,
    customText,
  );

  const components: FormNodeComponent[] = [];

  if (extraData?.totpUri) {
    components.push({
      id: "qr_code",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: extraData.totpUri,
      },
      order: 0,
    });
  }

  if (extraData?.secretBase32) {
    components.push({
      id: "secret_key",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `${m.secretLabel()} <code>${extraData.secretBase32}</code>`,
      },
      order: 1,
    });
  }

  components.push(
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
      order: 2,
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
      order: 3,
    },
  );

  const screen: UiScreen = {
    name: "mfa-totp-enrollment",
    action: `${routePrefix}/mfa/totp-enrollment?state=${encodeURIComponent(state)}`,
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
 * Screen definition for the mfa-totp-enrollment screen
 */
export const mfaTotpEnrollmentScreenDefinition: ScreenDefinition = {
  id: "mfa-totp-enrollment",
  name: "MFA TOTP Enrollment",
  description: "Authenticator app enrollment screen for TOTP MFA",
  handler: {
    get: async (context) => {
      const { ctx, client, state } = context;

      // Get the login session
      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (!loginSession || !loginSession.user_id) {
        return mfaTotpEnrollmentScreen(context);
      }

      const stateData = loginSession.state_data
        ? JSON.parse(loginSession.state_data)
        : {};

      // Check if we already have a pending TOTP enrollment
      let secretBase32 = stateData.totpSecret as string | undefined;
      if (!secretBase32) {
        // Generate a new TOTP secret
        secretBase32 = generateTotpSecret();

        // Create an unconfirmed TOTP enrollment
        const enrollment = await ctx.env.data.mfaEnrollments.create(
          client.tenant.id,
          {
            user_id: loginSession.user_id,
            type: "totp",
            totp_secret: secretBase32,
            confirmed: false,
          },
        );

        // Store the secret and enrollment ID in state_data
        await ctx.env.data.loginSessions.update(client.tenant.id, state, {
          state_data: JSON.stringify({
            ...stateData,
            totpSecret: secretBase32,
            mfaEnrollmentId: enrollment.id,
          }),
        });

        logMessage(ctx, client.tenant.id, {
          type: LogTypes.MFA_ENROLL_STARTED,
          description: "MFA TOTP enrollment started",
          userId: loginSession.user_id,
        });
      }

      // Get the user's email for the TOTP URI
      const user = await ctx.env.data.users.get(
        client.tenant.id,
        loginSession.user_id,
      );
      const accountName = user?.email || loginSession.user_id;
      const issuer = client.tenant.friendly_name || client.tenant.id;

      const totpUri = createTotpUri(issuer, accountName, secretBase32);

      return mfaTotpEnrollmentScreen(context, {
        totpUri,
        secretBase32,
      });
    },
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const code = (data.code as string)?.trim();

      const locale = context.language || "en";
      const { m } = createTranslation(
        "mfa-otp",
        "mfa-totp-enrollment",
        locale,
        context.customText,
      );

      // Validate code is provided
      if (!code) {
        const errorMessage = m["invalid-code"]();
        // Re-render with the secret
        const loginSession = await ctx.env.data.loginSessions.get(
          client.tenant.id,
          state,
        );
        const stateData = loginSession?.state_data
          ? JSON.parse(loginSession.state_data)
          : {};
        const secretBase32 = stateData.totpSecret as string | undefined;

        const user = loginSession?.user_id
          ? await ctx.env.data.users.get(
              client.tenant.id,
              loginSession.user_id,
            )
          : null;
        const accountName =
          user?.email || loginSession?.user_id || "";
        const issuer = client.tenant.friendly_name || client.tenant.id;

        return {
          error: errorMessage,
          screen: await mfaTotpEnrollmentScreen(
            { ...context, errors: { code: errorMessage } },
            secretBase32
              ? {
                  totpUri: createTotpUri(issuer, accountName, secretBase32),
                  secretBase32,
                }
              : undefined,
          ),
        };
      }

      // Get the login session
      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (!loginSession || !loginSession.user_id) {
        const errorMessage = m["transaction-not-found"]();
        return {
          error: errorMessage,
          screen: await mfaTotpEnrollmentScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }

      const stateData = loginSession.state_data
        ? JSON.parse(loginSession.state_data)
        : {};
      const secretBase32 = stateData.totpSecret as string | undefined;

      if (!secretBase32) {
        const errorMessage = m["transaction-not-found"]();
        return {
          error: errorMessage,
          screen: await mfaTotpEnrollmentScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }

      // Verify the TOTP code
      let valid: boolean;
      try {
        valid = await verifyTotpCode(secretBase32, code);
      } catch (err) {
        logMessage(ctx, client.tenant.id, {
          type: LogTypes.MFA_AUTH_FAILED,
          description: `MFA TOTP enrollment verification error: ${err instanceof Error ? err.message : "unknown error"}`,
          userId: loginSession.user_id,
        });

        const errorMessage = m.unexpectedError();
        return {
          error: errorMessage,
          screen: await mfaTotpEnrollmentScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }

      if (!valid) {
        logMessage(ctx, client.tenant.id, {
          type: LogTypes.MFA_AUTH_FAILED,
          description: "MFA TOTP enrollment verification failed - invalid code",
          userId: loginSession.user_id,
        });

        const user = await ctx.env.data.users.get(
          client.tenant.id,
          loginSession.user_id,
        );
        const accountName = user?.email || loginSession.user_id;
        const issuer = client.tenant.friendly_name || client.tenant.id;

        const errorMessage = m["invalid-code"]();
        return {
          error: errorMessage,
          screen: await mfaTotpEnrollmentScreen(
            { ...context, errors: { code: errorMessage } },
            {
              totpUri: createTotpUri(issuer, accountName, secretBase32),
              secretBase32,
            },
          ),
        };
      }

      // Confirm the enrollment
      if (stateData.mfaEnrollmentId) {
        await ctx.env.data.mfaEnrollments.update(
          client.tenant.id,
          stateData.mfaEnrollmentId,
          { confirmed: true },
        );

        logMessage(ctx, client.tenant.id, {
          type: LogTypes.MFA_ENROLLMENT_COMPLETE,
          description: "MFA TOTP enrollment completed",
          userId: loginSession.user_id,
        });
      }

      // Redirect to the TOTP challenge screen to complete MFA
      const routePrefix = context.routePrefix || "/u2";
      return {
        redirect: `${routePrefix}/mfa/totp-challenge?state=${encodeURIComponent(state)}`,
      };
    },
  },
};
