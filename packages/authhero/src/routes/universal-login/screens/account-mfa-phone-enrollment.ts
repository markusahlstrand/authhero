/**
 * Account MFA Phone Enrollment screen - enroll SMS MFA from account settings
 *
 * Corresponds to: /u2/account/security/phone-enrollment
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { LogTypes } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { resolveAccountUser } from "./account-helpers";
import { escapeHtml } from "../sanitization-utils";
import { sendMfaOtp, verifyMfaOtp } from "../../../authentication-flows/mfa";
import { logMessage } from "../../../helpers/logging";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";
import { createTranslation } from "../../../i18n";

function getTranslation(context: ScreenContext) {
  return createTranslation(
    "common",
    "account-mfa-phone-enrollment",
    context.language || "en",
    context.customText,
  );
}

/**
 * Render the phone number input screen (step 1)
 */
function phoneInputScreen(context: ScreenContext): ScreenResult {
  const { branding, state, errors, messages, routePrefix = "/u2" } = context;
  const { m } = getTranslation(context);
  const stateParam = encodeURIComponent(state);

  const components: FormNodeComponent[] = [
    {
      id: "action",
      type: "TEXT",
      category: "FIELD",
      visible: false,
      config: { default_value: "submit_phone" },
      required: false,
      order: 0,
    },
    {
      id: "phone_number",
      type: "TEL",
      category: "FIELD",
      visible: true,
      label: m.phoneLabel(),
      config: {
        placeholder: "+1 (555) 000-0000",
        default_country: context.ctx.get("countryCode") || "US",
      },
      required: true,
      order: 1,
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
        text: m.sendCodeButtonText(),
      },
      order: 2,
    },
  ];

  const screen: UiScreen = {
    name: "account-mfa-phone-enrollment",
    action: `${routePrefix}/account/security/phone-enrollment?state=${stateParam}`,
    method: "POST",
    title: m.title(),
    description: m.description(),
    components,
    links: [
      {
        id: "back-to-security",
        text: m.backToSecurityText(),
        href: `${routePrefix}/account/security?state=${stateParam}`,
      },
    ],
    messages,
  };

  return { screen, branding };
}

/**
 * Render the verification code input screen (step 2)
 */
function codeInputScreen(
  context: ScreenContext,
  maskedPhone: string | undefined,
): ScreenResult {
  const { branding, state, errors, messages, routePrefix = "/u2" } = context;
  const { m } = getTranslation(context);

  // Translate with a placeholder token so the masked number can be wrapped
  // in <strong> after the (possibly custom) text has been escaped.
  const phoneToken = "__PHONE_NUMBER__";
  const phoneInfoHtml = maskedPhone
    ? escapeHtml(m.codeSentText({ phoneNumber: phoneToken })).replace(
        phoneToken,
        `<strong>${escapeHtml(maskedPhone)}</strong>`,
      )
    : escapeHtml(m.codeSentToYourPhoneText());
  const stateParam = encodeURIComponent(state);

  const components: FormNodeComponent[] = [
    {
      id: "action",
      type: "TEXT",
      category: "FIELD",
      visible: false,
      config: { default_value: "verify_code" },
      required: false,
      order: 0,
    },
    {
      id: "phone-info",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<p style="text-align:center;color:#6b7280">${phoneInfoHtml}</p>`,
      },
      order: 1,
    },
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
        text: m.verifyButtonText(),
      },
      order: 3,
    },
  ];

  const screen: UiScreen = {
    name: "account-mfa-phone-enrollment",
    action: `${routePrefix}/account/security/phone-enrollment?state=${stateParam}`,
    method: "POST",
    title: m.verifyTitle(),
    description: m.verifyDescription(),
    components,
    links: [
      {
        id: "back-to-security",
        text: m.backToSecurityText(),
        href: `${routePrefix}/account/security?state=${stateParam}`,
      },
    ],
    messages,
  };

  return { screen, branding };
}

/**
 * Mask a phone number for display (e.g., +1 (555) 000-0000 → +1 (***) ***-0000)
 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length > 4) {
    return phone.slice(0, 4) + "*".repeat(phone.length - 6) + phone.slice(-2);
  }
  return phone;
}

/**
 * Screen definition for account MFA phone enrollment
 */
export const accountMfaPhoneEnrollmentScreenDefinition: ScreenDefinition = {
  id: "account-mfa-phone-enrollment",
  name: "Account MFA Phone Enrollment",
  description: "Enroll SMS MFA from account settings",
  handler: {
    get: (context) => {
      return Promise.resolve(phoneInputScreen(context));
    },
    post: async (context, data) => {
      const { ctx, tenant, client, state } = context;
      const { user } = await resolveAccountUser(context);
      const { m } = getTranslation(context);
      const action = data.action as string;

      // --- Step 1: Submit phone number and send OTP ---
      if (action === "submit_phone") {
        const phoneNumber = (data.phone_number as string)?.trim();

        if (!phoneNumber) {
          return {
            error: m.noPhoneText(),
            screen: phoneInputScreen({
              ...context,
              errors: { phone_number: m.noPhoneText() },
            }),
          };
        }

        // Normalize phone number to E.164 format
        const defaultCountry = (ctx.get("countryCode") || "US") as CountryCode;
        const parsed = parsePhoneNumberFromString(phoneNumber, {
          defaultCountry,
        });
        if (!parsed || !parsed.isValid()) {
          return {
            error: m.invalidPhoneText(),
            screen: phoneInputScreen({
              ...context,
              errors: { phone_number: m.invalidPhoneText() },
            }),
          };
        }
        const normalizedPhone = parsed.number; // E.164 format

        const loginSession = await ctx.env.data.loginSessions.get(
          tenant.id,
          state,
        );
        if (!loginSession) {
          const routePrefix = context.routePrefix || "/u2";
          return {
            redirect: `${routePrefix}/account/security?state=${encodeURIComponent(state)}`,
          };
        }

        try {
          logMessage(ctx, tenant.id, {
            type: LogTypes.MFA_ENROLL_STARTED,
            description: "MFA phone enrollment started from account settings",
            userId: user.user_id,
          });

          // Create an unconfirmed enrollment
          const enrollment = await ctx.env.data.authenticationMethods.create(
            tenant.id,
            {
              user_id: user.user_id,
              type: "phone",
              phone_number: normalizedPhone,
              confirmed: false,
            },
          );

          // Store enrollment ID and phone in state_data
          const stateData = loginSession.state_data
            ? JSON.parse(loginSession.state_data)
            : {};
          await ctx.env.data.loginSessions.update(tenant.id, state, {
            state_data: JSON.stringify({
              ...stateData,
              authenticationMethodId: enrollment.id,
              phoneNumber: normalizedPhone,
            }),
          });

          // Send OTP
          try {
            await sendMfaOtp(ctx, client, loginSession, normalizedPhone);
          } catch (otpErr) {
            // Roll back enrollment
            await ctx.env.data.authenticationMethods.remove(
              tenant.id,
              enrollment.id,
            );
            await ctx.env.data.loginSessions.update(tenant.id, state, {
              state_data: JSON.stringify(stateData),
            });
            throw otpErr;
          }

          return {
            screen: codeInputScreen(context, maskPhone(normalizedPhone)),
          };
        } catch (err) {
          logMessage(ctx, tenant.id, {
            type: LogTypes.MFA_ENROLLMENT_FAILED,
            description: `MFA phone enrollment failed: ${err instanceof Error ? err.message : String(err)}`,
            userId: user.user_id,
          });
          return {
            error: m.sendCodeFailedText(),
            screen: phoneInputScreen({
              ...context,
              errors: { phone_number: m.sendCodeFailedText() },
            }),
          };
        }
      }

      // --- Step 2: Verify OTP code ---
      if (action === "verify_code") {
        const code = (data.code as string)?.trim();

        const loginSession = await ctx.env.data.loginSessions.get(
          tenant.id,
          state,
        );
        const stateData = loginSession?.state_data
          ? JSON.parse(loginSession.state_data)
          : {};
        const phoneNumber = stateData.phoneNumber as string | undefined;
        const masked = phoneNumber ? maskPhone(phoneNumber) : undefined;

        if (!code) {
          return {
            error: m.noCodeText(),
            screen: codeInputScreen(
              {
                ...context,
                errors: { code: m.noCodeText() },
              },
              masked,
            ),
          };
        }

        if (!loginSession) {
          const routePrefix = context.routePrefix || "/u2";
          return {
            redirect: `${routePrefix}/account/security?state=${encodeURIComponent(state)}`,
          };
        }

        const valid = await verifyMfaOtp(ctx, tenant.id, loginSession.id, code);

        if (!valid) {
          logMessage(ctx, tenant.id, {
            type: LogTypes.MFA_AUTH_FAILED,
            description:
              "MFA phone enrollment verification failed - invalid code",
            userId: user.user_id,
          });
          return {
            error: m.invalidCodeText(),
            screen: codeInputScreen(
              {
                ...context,
                errors: { code: m.invalidCodeText() },
              },
              masked,
            ),
          };
        }

        // Confirm the enrollment
        if (!stateData.authenticationMethodId) {
          logMessage(ctx, tenant.id, {
            type: LogTypes.MFA_ENROLLMENT_FAILED,
            description:
              "MFA phone enrollment failed: missing authenticationMethodId in session state",
            userId: user.user_id,
          });
          return {
            error: m.sessionInvalidText(),
            screen: phoneInputScreen({
              ...context,
              errors: { phone_number: m.sessionInvalidText() },
            }),
          };
        }

        await ctx.env.data.authenticationMethods.update(
          tenant.id,
          stateData.authenticationMethodId,
          { confirmed: true },
        );

        logMessage(ctx, tenant.id, {
          type: LogTypes.MFA_ENROLLMENT_COMPLETE,
          description: "MFA phone enrollment completed from account settings",
          userId: user.user_id,
        });

        // Clean up state_data
        await ctx.env.data.loginSessions.update(tenant.id, state, {
          state_data: JSON.stringify({
            ...stateData,
            authenticationMethodId: undefined,
            phoneNumber: undefined,
          }),
        });

        // Redirect back to security settings
        const routePrefix = context.routePrefix || "/u2";
        return {
          redirect: `${routePrefix}/account/security?state=${encodeURIComponent(state)}`,
        };
      }

      // Default: show phone input
      return {
        screen: phoneInputScreen(context),
      };
    },
  },
};
