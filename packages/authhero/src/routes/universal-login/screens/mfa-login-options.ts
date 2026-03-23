/**
 * MFA Login Options screen - factor selection when multiple MFA methods are available
 *
 * Corresponds to: /u2/mfa/login-options
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { createTranslation } from "../../../i18n";
import { HTTPException } from "hono/http-exception";

interface MfaOption {
  id: string;
  type: "totp" | "phone";
  label: string;
  description: string;
}

/**
 * Create the mfa-login-options screen
 */
export async function mfaLoginOptionsScreen(
  context: ScreenContext,
  options: MfaOption[],
): Promise<ScreenResult> {
  const { branding, state, customText, routePrefix } = context;

  const locale = context.language || "en";
  const { m } = createTranslation(
    "mfa-login-options",
    "mfa-login-options",
    locale,
    customText,
  );

  const components: FormNodeComponent[] = options.map((option, index) => ({
    id: `factor_${option.id}`,
    type: "NEXT_BUTTON" as const,
    category: "BLOCK" as const,
    visible: true,
    config: {
      text: option.label,
    },
    order: index,
  }));

  // Add a hidden field to carry the selected factor
  components.push({
    id: "factor",
    type: "TEXT" as const,
    category: "FIELD" as const,
    visible: false,
    config: {},
    order: options.length,
  });

  const screen: UiScreen = {
    name: "mfa-login-options",
    action: `${routePrefix}/mfa/login-options?state=${encodeURIComponent(state)}`,
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
 * Screen definition for the mfa-login-options screen
 */
export const mfaLoginOptionsScreenDefinition: ScreenDefinition = {
  id: "mfa-login-options",
  name: "MFA Login Options",
  description:
    "Factor selection screen when multiple MFA methods are available",
  handler: {
    get: async (context) => {
      const { ctx, client, state } = context;

      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (!loginSession || !loginSession.user_id) {
        throw new HTTPException(400, { message: "Login session not found" });
      }

      const locale = context.language || "en";
      const { m } = createTranslation(
        "mfa-login-options",
        "mfa-login-options",
        locale,
        context.customText,
      );

      const tenant = client.tenant;
      const enrollments = await ctx.env.data.mfaEnrollments.list(
        tenant.id,
        loginSession.user_id,
      );
      const confirmedEnrollments = enrollments.filter(
        (e) => (e.type === "phone" || e.type === "totp") && e.confirmed,
      );

      const options: MfaOption[] = [];

      if (confirmedEnrollments.length > 0) {
        // User has confirmed enrollments - show those as options
        for (const enrollment of confirmedEnrollments) {
          if (enrollment.type === "totp") {
            options.push({
              id: enrollment.id,
              type: "totp",
              label: m.authenticatorAppLabel(),
              description: m.authenticatorAppDescription(),
            });
          } else if (enrollment.type === "phone") {
            const maskedPhone = enrollment.phone_number
              ? `****${enrollment.phone_number.slice(-4)}`
              : "";
            options.push({
              id: enrollment.id,
              type: "phone",
              label: `${m.smsLabel()} ${maskedPhone}`,
              description: m.smsDescription(),
            });
          }
        }
      } else {
        // User needs to enroll - show available factor types from tenant config
        if (tenant.mfa?.factors?.otp === true) {
          options.push({
            id: "enroll-totp",
            type: "totp",
            label: m.authenticatorAppLabel(),
            description: m.authenticatorAppDescription(),
          });
        }
        if (tenant.mfa?.factors?.sms === true) {
          options.push({
            id: "enroll-phone",
            type: "phone",
            label: m.smsLabel(),
            description: m.smsDescription(),
          });
        }
      }

      return mfaLoginOptionsScreen(context, options);
    },
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const routePrefix = context.routePrefix || "/u2";

      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (!loginSession || !loginSession.user_id) {
        throw new HTTPException(400, { message: "Login session not found" });
      }

      const stateData = loginSession.state_data
        ? JSON.parse(loginSession.state_data)
        : {};

      // Determine which button was clicked by checking the data keys
      // Each button submits as factor_<id>
      const selectedKey = Object.keys(data).find((k) =>
        k.startsWith("factor_"),
      );

      if (!selectedKey) {
        throw new HTTPException(400, { message: "No factor selected" });
      }

      const selectedId = selectedKey.replace("factor_", "");

      // Handle enrollment options
      if (selectedId === "enroll-totp") {
        return {
          redirect: `${routePrefix}/mfa/totp-enrollment?state=${encodeURIComponent(state)}`,
        };
      }
      if (selectedId === "enroll-phone") {
        return {
          redirect: `${routePrefix}/mfa/phone-enrollment?state=${encodeURIComponent(state)}`,
        };
      }

      // Handle existing enrollment selection
      const enrollments = await ctx.env.data.mfaEnrollments.list(
        client.tenant.id,
        loginSession.user_id,
      );
      const selectedEnrollment = enrollments.find((e) => e.id === selectedId);

      if (!selectedEnrollment) {
        throw new HTTPException(400, { message: "Invalid factor selected" });
      }

      // Store the selected enrollment ID in state_data
      await ctx.env.data.loginSessions.update(client.tenant.id, state, {
        state_data: JSON.stringify({
          ...stateData,
          mfaEnrollmentId: selectedEnrollment.id,
        }),
      });

      if (selectedEnrollment.type === "totp") {
        return {
          redirect: `${routePrefix}/mfa/totp-challenge?state=${encodeURIComponent(state)}`,
        };
      }

      // Phone - send OTP first
      if (selectedEnrollment.phone_number) {
        const { sendMfaOtp } =
          await import("../../../authentication-flows/mfa");
        await sendMfaOtp(
          ctx,
          client,
          loginSession,
          selectedEnrollment.phone_number,
        );
      }

      return {
        redirect: `${routePrefix}/mfa/phone-challenge?state=${encodeURIComponent(state)}`,
      };
    },
  },
};
