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

/**
 * Render the phone number input screen (step 1)
 */
function phoneInputScreen(context: ScreenContext): ScreenResult {
  const { branding, state, errors, messages, routePrefix = "/u2" } = context;
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
      label: "Phone number",
      config: {
        placeholder: "+1 (555) 000-0000",
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
        text: "Send Verification Code",
      },
      order: 2,
    },
  ];

  const screen: UiScreen = {
    name: "account-mfa-phone-enrollment",
    action: `${routePrefix}/account/security/phone-enrollment?state=${stateParam}`,
    method: "POST",
    title: "Set Up Phone (SMS)",
    description:
      "Enter your phone number to receive verification codes via SMS.",
    components,
    links: [
      {
        id: "back-to-security",
        text: "Back to Security Settings",
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
  maskedPhone: string,
): ScreenResult {
  const { branding, state, errors, messages, routePrefix = "/u2" } = context;
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
        content: `<p style="text-align:center;color:#6b7280">A verification code has been sent to <strong>${escapeHtml(maskedPhone)}</strong></p>`,
      },
      order: 1,
    },
    {
      id: "code",
      type: "TEXT",
      category: "FIELD",
      visible: true,
      label: "Verification code",
      config: {
        placeholder: "Enter verification code",
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
        text: "Verify & Enable",
      },
      order: 3,
    },
  ];

  const screen: UiScreen = {
    name: "account-mfa-phone-enrollment",
    action: `${routePrefix}/account/security/phone-enrollment?state=${stateParam}`,
    method: "POST",
    title: "Verify Phone Number",
    description: "Enter the verification code sent to your phone.",
    components,
    links: [
      {
        id: "back-to-security",
        text: "Back to Security Settings",
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
      const action = data.action as string;

      // --- Step 1: Submit phone number and send OTP ---
      if (action === "submit_phone") {
        const phoneNumber = (data.phone_number as string)?.trim();

        if (!phoneNumber) {
          return {
            error: "Please enter your phone number",
            screen: phoneInputScreen({
              ...context,
              errors: { phone_number: "Please enter your phone number" },
            }),
          };
        }

        if (!/^\+?\d[\d\s\-()]{6,}$/.test(phoneNumber)) {
          return {
            error: "Invalid phone number",
            screen: phoneInputScreen({
              ...context,
              errors: { phone_number: "Please enter a valid phone number" },
            }),
          };
        }

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
              phone_number: phoneNumber,
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
              phoneNumber,
            }),
          });

          // Send OTP
          try {
            await sendMfaOtp(ctx, client, loginSession, phoneNumber);
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
            screen: codeInputScreen(context, maskPhone(phoneNumber)),
          };
        } catch (err) {
          logMessage(ctx, tenant.id, {
            type: LogTypes.MFA_ENROLLMENT_FAILED,
            description: `MFA phone enrollment failed: ${err instanceof Error ? err.message : String(err)}`,
            userId: user.user_id,
          });
          return {
            error: "Failed to send verification code",
            screen: phoneInputScreen({
              ...context,
              errors: {
                phone_number:
                  "Failed to send verification code. Please try again.",
              },
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
        const masked = phoneNumber ? maskPhone(phoneNumber) : "your phone";

        if (!code) {
          return {
            error: "Please enter the verification code",
            screen: codeInputScreen(
              {
                ...context,
                errors: { code: "Please enter the verification code" },
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
            error: "Invalid code",
            screen: codeInputScreen(
              {
                ...context,
                errors: { code: "Invalid code. Please try again." },
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
            error: "Enrollment session is invalid",
            screen: phoneInputScreen({
              ...context,
              errors: {
                phone_number:
                  "Something went wrong. Please start the enrollment again.",
              },
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
