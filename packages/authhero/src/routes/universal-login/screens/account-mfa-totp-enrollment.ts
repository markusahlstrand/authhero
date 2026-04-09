/**
 * Account MFA TOTP Enrollment screen - enroll authenticator app from account settings
 *
 * Corresponds to: /u2/account/security/totp-enrollment
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { LogTypes } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { resolveAccountUser } from "./account-helpers";
import {
  generateTotpSecret,
  createTotpUri,
  verifyTotpCode,
} from "../../../authentication-flows/mfa";
import { logMessage } from "../../../helpers/logging";
import QRCode from "qrcode";

async function generateQrCodeHtml(totpUri: string): Promise<string> {
  const svg = await QRCode.toString(totpUri, {
    type: "svg",
    margin: 2,
    width: 200,
  });
  const dataUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
  return `<img src="${dataUrl}" alt="QR Code" width="200" height="200" />`;
}

/**
 * Create the account-mfa-totp-enrollment screen
 */
async function accountMfaTotpEnrollmentScreen(
  context: ScreenContext,
  extraData?: { qrCodeSvg?: string; secretBase32?: string },
): Promise<ScreenResult> {
  const { branding, state, errors, messages, routePrefix = "/u2" } = context;
  const stateParam = encodeURIComponent(state);

  const components: FormNodeComponent[] = [];

  if (extraData?.qrCodeSvg) {
    components.push({
      id: "qr_code",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<div style="display:flex;justify-content:center">${extraData.qrCodeSvg}</div>`,
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
        content: `<p style="text-align:center;font-size:13px;color:#6b7280">Or enter this key manually:</p><p style="text-align:center;font-family:monospace;font-size:14px;word-break:break-all">${extraData.secretBase32}</p>`,
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
      label: "Verification code",
      config: {
        placeholder: "Enter 6-digit code",
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
  );

  const screen: UiScreen = {
    name: "account-mfa-totp-enrollment",
    action: `${routePrefix}/account/security/totp-enrollment?state=${stateParam}`,
    method: "POST",
    title: "Set Up Authenticator App",
    description:
      "Scan the QR code with your authenticator app, then enter the verification code below.",
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
 * Screen definition for account MFA TOTP enrollment
 */
export const accountMfaTotpEnrollmentScreenDefinition: ScreenDefinition = {
  id: "account-mfa-totp-enrollment",
  name: "Account MFA TOTP Enrollment",
  description: "Enroll authenticator app from account settings",
  handler: {
    get: async (context) => {
      const { ctx, tenant, state } = context;
      const { user } = await resolveAccountUser(context);

      // Generate a new TOTP secret
      const secretBase32 = generateTotpSecret();

      // Create an unconfirmed TOTP enrollment
      const enrollment = await ctx.env.data.authenticationMethods.create(
        tenant.id,
        {
          user_id: user.user_id,
          type: "totp",
          totp_secret: secretBase32,
          confirmed: false,
        },
      );

      // Store the secret and enrollment ID in login session state_data
      const loginSession = await ctx.env.data.loginSessions.get(
        tenant.id,
        state,
      );
      const stateData = loginSession?.state_data
        ? JSON.parse(loginSession.state_data)
        : {};
      await ctx.env.data.loginSessions.update(tenant.id, state, {
        state_data: JSON.stringify({
          ...stateData,
          totpSecret: secretBase32,
          authenticationMethodId: enrollment.id,
        }),
      });

      logMessage(ctx, tenant.id, {
        type: LogTypes.MFA_ENROLL_STARTED,
        description: "MFA TOTP enrollment started from account settings",
        userId: user.user_id,
      });

      // Generate QR code
      const accountName = user.email || user.user_id;
      const issuer = tenant.friendly_name || tenant.id;
      const totpUri = createTotpUri(issuer, accountName, secretBase32);
      const qrCodeSvg = await generateQrCodeHtml(totpUri);

      return accountMfaTotpEnrollmentScreen(context, {
        qrCodeSvg,
        secretBase32,
      });
    },
    post: async (context, data) => {
      const { ctx, tenant, state } = context;
      const code = (data.code as string)?.trim();
      const { user } = await resolveAccountUser(context);

      if (!code) {
        return {
          error: "Please enter the verification code",
          screen: await reRenderWithQr(context, "Please enter the verification code"),
        };
      }

      // Get the secret from login session state_data
      const loginSession = await ctx.env.data.loginSessions.get(
        tenant.id,
        state,
      );
      const stateData = loginSession?.state_data
        ? JSON.parse(loginSession.state_data)
        : {};
      const secretBase32 = stateData.totpSecret as string | undefined;

      if (!secretBase32) {
        // Session expired or secret lost — redirect to start over
        const routePrefix = context.routePrefix || "/u2";
        return {
          redirect: `${routePrefix}/account/security/totp-enrollment?state=${encodeURIComponent(state)}`,
        };
      }

      // Verify the TOTP code
      let valid: boolean;
      try {
        valid = await verifyTotpCode(secretBase32, code);
      } catch (err) {
        logMessage(ctx, tenant.id, {
          type: LogTypes.MFA_AUTH_FAILED,
          description: `MFA TOTP enrollment verification error: ${err instanceof Error ? err.message : "unknown error"}`,
          userId: user.user_id,
        });
        return {
          error: "Verification failed",
          screen: await reRenderWithQr(context, "Verification failed. Please try again."),
        };
      }

      if (!valid) {
        logMessage(ctx, tenant.id, {
          type: LogTypes.MFA_AUTH_FAILED,
          description:
            "MFA TOTP enrollment verification failed - invalid code",
          userId: user.user_id,
        });
        return {
          error: "Invalid code",
          screen: await reRenderWithQr(context, "Invalid code. Please try again."),
        };
      }

      // Confirm the enrollment
      if (stateData.authenticationMethodId) {
        await ctx.env.data.authenticationMethods.update(
          tenant.id,
          stateData.authenticationMethodId,
          { confirmed: true },
        );
      }

      logMessage(ctx, tenant.id, {
        type: LogTypes.MFA_ENROLLMENT_COMPLETE,
        description: "MFA TOTP enrollment completed from account settings",
        userId: user.user_id,
      });

      // Clean up state_data
      await ctx.env.data.loginSessions.update(tenant.id, state, {
        state_data: JSON.stringify({
          ...stateData,
          totpSecret: undefined,
          authenticationMethodId: undefined,
        }),
      });

      // Redirect back to security settings with success
      const routePrefix = context.routePrefix || "/u2";
      return {
        redirect: `${routePrefix}/account/security?state=${encodeURIComponent(state)}`,
      };
    },
  },
};

/**
 * Re-render the enrollment screen with QR code after a validation error
 */
async function reRenderWithQr(
  context: ScreenContext,
  errorMessage: string,
): Promise<ScreenResult> {
  const { ctx, tenant, state } = context;
  const { user } = await resolveAccountUser(context);

  const loginSession = await ctx.env.data.loginSessions.get(tenant.id, state);
  const stateData = loginSession?.state_data
    ? JSON.parse(loginSession.state_data)
    : {};
  const secretBase32 = stateData.totpSecret as string | undefined;

  let qrCodeSvg: string | undefined;
  if (secretBase32) {
    const accountName = user.email || user.user_id;
    const issuer = tenant.friendly_name || tenant.id;
    const totpUri = createTotpUri(issuer, accountName, secretBase32);
    qrCodeSvg = await generateQrCodeHtml(totpUri);
  }

  return accountMfaTotpEnrollmentScreen(
    { ...context, errors: { code: errorMessage } },
    secretBase32 ? { qrCodeSvg, secretBase32 } : undefined,
  );
}
