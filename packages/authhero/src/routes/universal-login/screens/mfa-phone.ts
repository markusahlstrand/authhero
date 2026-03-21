/**
 * MFA Phone Enrollment screen - for setting up SMS MFA
 *
 * Corresponds to: /u2/mfa/phone
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { createTranslation } from "../../../i18n";
import { sendMfaOtp } from "../../../authentication-flows/mfa";

/**
 * Create the mfa-phone screen
 */
export async function mfaPhoneScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, errors, customText, routePrefix } = context;

  const locale = context.language || "en";
  const { m } = createTranslation(locale, customText, undefined, "mfa-phone");

  const components: FormNodeComponent[] = [
    {
      id: "phone_number",
      type: "TEXT",
      category: "FIELD",
      visible: true,
      label: m.mfa_phone__phone_placeholder(),
      config: {
        placeholder: m.mfa_phone__phone_placeholder(),
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
        text: m.mfa_phone__button_text(),
      },
      order: 1,
    },
  ];

  const screen: UiScreen = {
    name: "mfa-phone",
    action: `${routePrefix}/mfa/phone?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.mfa_phone__title(),
    description: m.mfa_phone__description(),
    components,
  };

  return {
    screen,
    branding,
  };
}

/**
 * Screen definition for the mfa-phone screen
 */
export const mfaPhoneScreenDefinition: ScreenDefinition = {
  id: "mfa-phone",
  name: "MFA Phone Enrollment",
  description: "Phone number enrollment screen for SMS MFA",
  handler: {
    get: mfaPhoneScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const phoneNumber = (data.phone_number as string)?.trim();

      const locale = context.language || "en";
      const { m } = createTranslation(
        locale,
        context.customText,
        undefined,
        "mfa-phone",
      );

      // Validate phone number
      if (!phoneNumber) {
        const errorMessage = m.no_phone();
        return {
          error: errorMessage,
          screen: await mfaPhoneScreen({
            ...context,
            errors: { phone_number: errorMessage },
          }),
        };
      }

      // Basic phone number validation
      if (!/^\+?\d[\d\s\-()]{6,}$/.test(phoneNumber)) {
        const errorMessage = m.invalid_phone();
        return {
          error: errorMessage,
          screen: await mfaPhoneScreen({
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
        const errorMessage = m.session_expired();
        return {
          error: errorMessage,
          screen: await mfaPhoneScreen({
            ...context,
            errors: { phone_number: errorMessage },
          }),
        };
      }

      try {
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

        // Store the enrollment ID in state_data so the MFA SMS screen knows
        const existingStateData = loginSession.state_data
          ? JSON.parse(loginSession.state_data)
          : {};
        await ctx.env.data.loginSessions.update(client.tenant.id, state, {
          state_data: JSON.stringify({
            ...existingStateData,
            mfaEnrollmentId: enrollment.id,
          }),
        });

        // Redirect to SMS verification screen
        const routePrefix = context.routePrefix || "/u2";
        return {
          redirect: `${routePrefix}/mfa/sms?state=${encodeURIComponent(state)}`,
        };
      } catch {
        const errorMessage = m.unexpected_error_try_again();
        return {
          error: errorMessage,
          screen: await mfaPhoneScreen({
            ...context,
            errors: { phone_number: errorMessage },
          }),
        };
      }
    },
  },
};
