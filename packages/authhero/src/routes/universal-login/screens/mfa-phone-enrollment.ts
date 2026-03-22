/**
 * MFA Phone Enrollment screen - for setting up SMS MFA
 *
 * Corresponds to: /u2/mfa/phone-enrollment
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { LogTypes } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { createTranslation } from "../../../i18n";
import { sendMfaOtp } from "../../../authentication-flows/mfa";
import { logMessage } from "../../../helpers/logging";

/**
 * Create the mfa-phone-enrollment screen
 */
export async function mfaPhoneEnrollmentScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, errors, customText, routePrefix } = context;

  const locale = context.language || "en";
  const { m } = createTranslation("mfa-phone", "mfa-phone-enrollment", locale, customText);

  const components: FormNodeComponent[] = [
    {
      id: "phone_number",
      type: "TEL",
      category: "FIELD",
      visible: true,
      label: m.placeholder(),
      config: {
        placeholder: m.placeholder(),
      },
      required: true,
      order: 0,
      messages: errors?.phone_number
        ? [{ text: errors.phone_number, type: "error" as const }]
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
    name: "mfa-phone-enrollment",
    action: `${routePrefix}/mfa/phone-enrollment?state=${encodeURIComponent(state)}`,
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
 * Screen definition for the mfa-phone-enrollment screen
 */
export const mfaPhoneEnrollmentScreenDefinition: ScreenDefinition = {
  id: "mfa-phone-enrollment",
  name: "MFA Phone Enrollment",
  description: "Phone number enrollment screen for SMS MFA",
  handler: {
    get: mfaPhoneEnrollmentScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const phoneNumber = (data.phone_number as string)?.trim();

      const locale = context.language || "en";
      const { m } = createTranslation(
        "mfa-phone",
        "mfa-phone-enrollment",
        locale,
        context.customText,
      );

      // Validate phone number
      if (!phoneNumber) {
        const errorMessage = m["no-phone"]();
        return {
          error: errorMessage,
          screen: await mfaPhoneEnrollmentScreen({
            ...context,
            errors: { phone_number: errorMessage },
          }),
        };
      }

      // Basic phone number validation
      if (!/^\+?\d[\d\s\-()]{6,}$/.test(phoneNumber)) {
        const errorMessage = m["invalid-phone"]();
        return {
          error: errorMessage,
          screen: await mfaPhoneEnrollmentScreen({
            ...context,
            errors: { phone_number: errorMessage },
          }),
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
          screen: await mfaPhoneEnrollmentScreen({
            ...context,
            errors: { phone_number: errorMessage },
          }),
        };
      }

      try {
        logMessage(ctx, client.tenant.id, {
          type: LogTypes.MFA_ENROLL_STARTED,
          description: "MFA phone enrollment started",
          userId: loginSession.user_id,
        });

        // Create an unconfirmed MFA enrollment
        const enrollment = await ctx.env.data.mfaEnrollments.create(
          client.tenant.id,
          {
            user_id: loginSession.user_id,
            type: "phone",
            phone_number: phoneNumber,
            confirmed: false,
          },
        );

        // Send OTP SMS
        await sendMfaOtp(ctx, client, loginSession, phoneNumber);

        // Store the enrollment ID in state_data so the challenge screen knows
        const existingStateData = loginSession.state_data
          ? JSON.parse(loginSession.state_data)
          : {};
        await ctx.env.data.loginSessions.update(client.tenant.id, state, {
          state_data: JSON.stringify({
            ...existingStateData,
            mfaEnrollmentId: enrollment.id,
          }),
        });

        // Redirect to phone challenge screen
        const routePrefix = context.routePrefix || "/u2";
        return {
          redirect: `${routePrefix}/mfa/phone-challenge?state=${encodeURIComponent(state)}`,
        };
      } catch (err) {
        console.error("[mfa-phone-enrollment] Error during phone enrollment:", err);
        logMessage(ctx, client.tenant.id, {
          type: LogTypes.MFA_ENROLLMENT_FAILED,
          description: `MFA phone enrollment failed: ${err instanceof Error ? err.message : String(err)}`,
          userId: loginSession.user_id,
        });
        const errorMessage = m["sms-authenticator-error"]();
        return {
          error: errorMessage,
          screen: await mfaPhoneEnrollmentScreen({
            ...context,
            errors: { phone_number: errorMessage },
          }),
        };
      }
    },
  },
};
