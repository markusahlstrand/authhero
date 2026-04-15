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
import { HTTPException } from "hono/http-exception";
import {
  parsePhoneNumberFromString,
  isSupportedCountry,
} from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";

function getValidCountryCode(raw: string | undefined): CountryCode {
  if (raw && isSupportedCountry(raw)) {
    return raw;
  }
  return "US";
}

/**
 * Create the mfa-phone-enrollment screen
 */
export async function mfaPhoneEnrollmentScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, errors, customText, routePrefix } = context;

  const locale = context.language || "en";
  const { m } = createTranslation(
    "mfa-phone",
    "mfa-phone-enrollment",
    locale,
    customText,
  );

  const components: FormNodeComponent[] = [
    {
      id: "phone_number",
      type: "TEL",
      category: "FIELD",
      visible: true,
      label: m.placeholder(),
      config: {
        placeholder: m.placeholder(),
        default_country: getValidCountryCode(context.ctx.get("countryCode")),
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

  const links: UiScreen["links"] = [];

  // Show back link to login-options when multiple MFA factors are available
  const tenant = context.client.tenant;
  const hasMultipleFactors =
    tenant.mfa?.factors?.otp === true && tenant.mfa?.factors?.sms === true;
  if (hasMultipleFactors) {
    links.push({
      id: "back",
      text: "",
      linkText: "Try another method",
      href: `${routePrefix}/mfa/login-options?state=${encodeURIComponent(state)}`,
    });
  }

  const screen: UiScreen = {
    name: "mfa-phone-enrollment",
    action: `${routePrefix}/mfa/phone-enrollment?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    description: m.description(),
    components,
    ...(links.length > 0 && { links }),
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
    get: async (context) => {
      const { ctx, client, state } = context;

      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (loginSession?.user_id) {
        // Block enrollment if user already has confirmed MFA methods
        const existingMethods = await ctx.env.data.authenticationMethods.list(
          client.tenant.id,
          loginSession.user_id,
        );
        if (existingMethods.some((e) => e.confirmed)) {
          throw new HTTPException(403, {
            message:
              "Cannot enroll new MFA factor while existing factors are active",
          });
        }
      }

      return mfaPhoneEnrollmentScreen(context);
    },
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

      // Get the login session early so we can check enrollment status before validation
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

      // Block enrollment if user already has confirmed MFA methods
      const existingMethods = await ctx.env.data.authenticationMethods.list(
        client.tenant.id,
        loginSession.user_id,
      );
      if (existingMethods.some((e) => e.confirmed)) {
        throw new HTTPException(403, {
          message:
            "Cannot enroll new MFA factor while existing factors are active",
        });
      }

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

      // Normalize phone number to E.164 format
      const defaultCountry = getValidCountryCode(ctx.get("countryCode"));
      const parsed = parsePhoneNumberFromString(phoneNumber, {
        defaultCountry,
      });
      if (!parsed || !parsed.isValid()) {
        const errorMessage = m["invalid-phone"]();
        return {
          error: errorMessage,
          screen: await mfaPhoneEnrollmentScreen({
            ...context,
            errors: { phone_number: errorMessage },
          }),
        };
      }
      const normalizedPhone = parsed.number; // E.164 format

      try {
        logMessage(ctx, client.tenant.id, {
          type: LogTypes.MFA_ENROLL_STARTED,
          description: "MFA phone enrollment started",
          userId: loginSession.user_id,
        });

        // Create an unconfirmed MFA enrollment
        const enrollment = await ctx.env.data.authenticationMethods.create(
          client.tenant.id,
          {
            user_id: loginSession.user_id,
            type: "phone",
            phone_number: normalizedPhone,
            confirmed: false,
          },
        );

        // Store the enrollment ID in state_data before sending OTP,
        // so the session is linked to the enrollment before any OTP is sent
        const existingStateData = loginSession.state_data
          ? JSON.parse(loginSession.state_data)
          : {};
        await ctx.env.data.loginSessions.update(client.tenant.id, state, {
          state_data: JSON.stringify({
            ...existingStateData,
            authenticationMethodId: enrollment.id,
          }),
        });

        // Send OTP SMS only after the session is updated
        try {
          await sendMfaOtp(ctx, client, loginSession, normalizedPhone);
        } catch (otpErr) {
          // Roll back: delete the enrollment since OTP delivery failed
          await ctx.env.data.authenticationMethods.remove(
            client.tenant.id,
            enrollment.id,
          );
          // Revert session state_data so it no longer references the removed enrollment
          await ctx.env.data.loginSessions.update(client.tenant.id, state, {
            state_data: JSON.stringify(existingStateData),
          });
          throw otpErr;
        }

        // Redirect to phone challenge screen
        const routePrefix = context.routePrefix || "/u2";
        return {
          redirect: `${routePrefix}/mfa/phone-challenge?state=${encodeURIComponent(state)}`,
        };
      } catch (err) {
        console.error(
          "[mfa-phone-enrollment] Error during phone enrollment:",
          err,
        );
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
