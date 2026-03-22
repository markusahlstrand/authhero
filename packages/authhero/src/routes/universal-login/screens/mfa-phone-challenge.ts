/**
 * MFA Phone Challenge screen - for verifying SMS MFA code
 *
 * Corresponds to: /u2/mfa/phone-challenge
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { LoginSessionState, LogTypes } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { escapeHtml } from "../sanitization-utils";
import { createTranslation } from "../../../i18n";
import {
  verifyMfaOtp,
  sendMfaOtp,
} from "../../../authentication-flows/mfa";
import {
  transitionLoginSession,
  LoginSessionEventType,
} from "../../../state-machines/login-session";
import { createFrontChannelAuthResponse } from "../../../authentication-flows/common";
import { logMessage } from "../../../helpers/logging";

/**
 * Create the mfa-phone-challenge screen
 */
export async function mfaPhoneChallengeScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, errors, messages, data, customText, routePrefix } =
    context;

  const locale = context.language || "en";
  const { m } = createTranslation("mfa-phone", "mfa-phone-challenge", locale, customText);

  const phone = data?.phone as string | undefined;

  // Mask the phone number for display
  let maskedPhone = "";
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length > 6) {
      const prefix = phone.slice(0, 4);
      const suffix = phone.slice(-2);
      maskedPhone = prefix + "*".repeat(phone.length - 6) + suffix;
    } else {
      maskedPhone = phone;
    }
  }

  const description = maskedPhone
    ? m.description({
        phoneNumber: `<strong>${escapeHtml(maskedPhone)}</strong>`,
      })
    : m.description({ phoneNumber: "" });

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
    {
      id: "resend",
      type: "RESEND_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: m.smsButtonText(),
      },
      order: 2,
    },
  ];

  const screen: UiScreen = {
    name: "mfa-phone-challenge",
    action: `${routePrefix}/mfa/phone-challenge?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    description,
    components,
    messages: messages?.map((msg) => ({ text: msg.text, type: msg.type })),
  };

  return {
    screen,
    branding,
  };
}

/**
 * Get the phone number for the current MFA enrollment from the login session state_data
 */
async function getEnrollmentPhone(
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
    if (enrollment?.phone_number) {
      return enrollment.phone_number;
    }
  }

  if (loginSession.user_id) {
    const enrollments = await ctx.env.data.mfaEnrollments.list(
      tenantId,
      loginSession.user_id,
    );
    const phoneEnrollment = enrollments.find((e) => e.type === "phone");
    if (phoneEnrollment?.phone_number) {
      return phoneEnrollment.phone_number;
    }
  }

  return undefined;
}

/**
 * Screen definition for the mfa-phone-challenge screen
 */
export const mfaPhoneChallengeScreenDefinition: ScreenDefinition = {
  id: "mfa-phone-challenge",
  name: "MFA Phone Challenge",
  description: "Phone code verification screen for MFA",
  handler: {
    get: mfaPhoneChallengeScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const code = (data.code as string)?.trim();

      const locale = context.language || "en";
      const { m } = createTranslation(
        "mfa-phone",
        "mfa-phone-challenge",
        locale,
        context.customText,
      );

      // Handle resend action
      if (data.action === "resend") {
        const loginSession = await ctx.env.data.loginSessions.get(
          client.tenant.id,
          state,
        );

        if (!loginSession) {
          return {
            screen: await mfaPhoneChallengeScreen(context),
          };
        }

        const phone = await getEnrollmentPhone(
          ctx,
          client.tenant.id,
          loginSession,
        );

        if (!phone) {
          return {
            screen: await mfaPhoneChallengeScreen({
              ...context,
              data: { ...context.data, phone },
            }),
          };
        }

        const messages: { text: string; type: "success" | "error" }[] = [];
        try {
          await sendMfaOtp(ctx, client, loginSession, phone);
          messages.push({ text: m.resendSuccess(), type: "success" });
        } catch {
          messages.push({ text: m["send-sms-failed"](), type: "error" });
        }

        return {
          screen: await mfaPhoneChallengeScreen({
            ...context,
            data: { ...context.data, phone },
            messages,
          }),
        };
      }

      // Validate code is provided
      if (!code) {
        const errorMessage = m["no-phone"]();
        return {
          error: errorMessage,
          screen: await mfaPhoneChallengeScreen({
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

      if (!loginSession || !loginSession.user_id) {
        const errorMessage = m["transaction-not-found"]();
        return {
          error: errorMessage,
          screen: await mfaPhoneChallengeScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }

      logMessage(ctx, client.tenant.id, {
        type: LogTypes.SECOND_FACTOR_STARTED,
        description: "MFA verification started",
        userId: loginSession.user_id,
      });

      // Verify the OTP code
      const valid = await verifyMfaOtp(
        ctx,
        client.tenant.id,
        loginSession.id,
        code,
      );

      if (!valid) {
        logMessage(ctx, client.tenant.id, {
          type: LogTypes.MFA_AUTH_FAILED,
          description: "MFA verification failed - invalid code",
          userId: loginSession.user_id,
        });

        const phone = await getEnrollmentPhone(
          ctx,
          client.tenant.id,
          loginSession,
        );
        const errorMessage = m["invalid-phone"]();
        return {
          error: errorMessage,
          screen: await mfaPhoneChallengeScreen({
            ...context,
            data: { ...context.data, phone },
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
              description: "MFA phone enrollment completed",
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
          description: "MFA verification succeeded",
          userId: loginSession.user_id,
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

        // Only mark MFA as verified after successfully producing the auth response
        await ctx.env.data.loginSessions.update(client.tenant.id, state, {
          state: newState,
          state_data: JSON.stringify({
            ...stateData,
            mfa_verified: true,
          }),
        });

        const location = result.headers.get("location");
        const cookies = result.headers.getSetCookie?.() || [];
        if (location) {
          return { redirect: location, cookies };
        }
        return { response: result };
      } catch {
        const phone = await getEnrollmentPhone(
          ctx,
          client.tenant.id,
          loginSession,
        );
        const errorMessage = m["send-sms-failed"]();
        return {
          error: errorMessage,
          screen: await mfaPhoneChallengeScreen({
            ...context,
            data: { ...context.data, phone },
            errors: { code: errorMessage },
          }),
        };
      }
    },
  },
};
