/**
 * Passkey Enrollment screen — WebAuthn registration ceremony
 *
 * GET:  Generates WebAuthn registration options and renders a screen that
 *       triggers `navigator.credentials.create()` via an inline script.
 * POST: Verifies the attestation response and stores the credential.
 *
 * Corresponds to: /u2/passkey/enrollment
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { LogTypes, LoginSessionState } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { createTranslation } from "../../../i18n";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import {
  createFrontChannelAuthResponse,
  completeLoginSessionContinuation,
  hasValidContinuationScope,
} from "../../../authentication-flows/common";
import { logMessage } from "../../../helpers/logging";
import {
  PASSKEY_TYPES,
  getRpId,
  getExpectedOrigin,
  buildWebAuthnRegistrationScript,
  buildWebAuthnCeremony,
} from "./passkey-utils";

/**
 * Build the passkey enrollment screen UI
 */
async function passkeyEnrollmentScreen(
  context: ScreenContext,
  extra?: {
    optionsJSON?: string;
    errorMessage?: string;
    isGuardianEnrollment?: boolean;
  },
): Promise<ScreenResult> {
  const { branding, state, routePrefix } = context;

  const locale = context.language || "en";
  const { m } = createTranslation(
    "passkeys",
    "passkey-enrollment",
    locale,
    context.customText,
  );

  const components: FormNodeComponent[] = [];

  if (extra?.errorMessage) {
    components.push({
      id: "error_msg",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<div role="alert" style="color:#dc2626;margin-bottom:12px">${extra.errorMessage}</div>`,
      },
      order: 0,
    });
  }

  // Hidden fields for form submission (TEXT with visible:false)
  components.push(
    {
      id: "credential-field",
      type: "TEXT" as const,
      category: "FIELD" as const,
      visible: false,
      config: {},
      order: 2,
    },
    {
      id: "action-field",
      type: "TEXT" as const,
      category: "FIELD" as const,
      visible: false,
      config: {},
      order: 3,
    },
  );

  // Retry button (shown when there's an error)
  if (extra?.errorMessage) {
    components.push({
      id: "retry",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: m.retryButtonText(),
      },
      order: 4,
    });
  }

  const links: UiScreen["links"] = [];
  // Only show "Skip for now" in continuation flow, not guardian enrollment
  if (!extra?.isGuardianEnrollment) {
    links.push({
      id: "skip",
      text: "",
      linkText: m.cancelLinkText(),
      href: `javascript:void(function(){var f=document.querySelector('form');if(!f){var w=document.querySelector('authhero-widget');if(w&&w.shadowRoot)f=w.shadowRoot.querySelector('form')}if(f){var a=f.querySelector('[name="action-field"]')||f.querySelector('#action-field');if(a){a.value='skip'}f.submit()}}())`,
    });
  }

  const screen: UiScreen = {
    name: "passkey-enrollment",
    action: `${routePrefix}/passkey/enrollment?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    description: extra?.errorMessage ? undefined : m.description(),
    components,
    ...(links.length > 0 && { links }),
  };

  // Build WebAuthn script to run at page level (SSR) and structured ceremony data (widget SPA)
  let extraScript: string | undefined;
  let ceremony: ReturnType<typeof buildWebAuthnCeremony> | undefined;
  if (extra?.optionsJSON) {
    extraScript = buildWebAuthnRegistrationScript(extra.optionsJSON);
    ceremony = buildWebAuthnCeremony(extra.optionsJSON);
  }

  return { screen, branding, extraScript, ceremony };
}

/**
 * Generate fresh WebAuthn registration options and store the challenge.
 * Returns the JSON string for optionsJSON, or undefined if session/user is missing.
 */
async function generateFreshOptionsJSON(
  context: ScreenContext,
): Promise<string | undefined> {
  const { ctx, client, state } = context;

  const loginSession = await ctx.env.data.loginSessions.get(
    client.tenant.id,
    state,
  );
  if (!loginSession?.user_id) return undefined;

  const user = await ctx.env.data.users.get(
    client.tenant.id,
    loginSession.user_id,
  );
  if (!user) return undefined;

  const enrollments = await ctx.env.data.authenticationMethods.list(
    client.tenant.id,
    user.user_id,
  );
  const excludeCredentials = enrollments
    .filter(
      (e) => PASSKEY_TYPES.includes(e.type as (typeof PASSKEY_TYPES)[number]) && e.credential_id,
    )
    .map((e) => ({
      id: e.credential_id!,
      transports: (e.transports || []) as AuthenticatorTransport[],
    }));

  const rpId = getRpId(ctx);
  const rpName = client.tenant.friendly_name || client.tenant.id || "AuthHero";
  const userName = user.email || user.username || user.user_id;
  const userDisplayName = user.name || user.email || user.user_id;

  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userName,
    userDisplayName,
    excludeCredentials,
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
    attestationType: "none",
    timeout: 60000,
  });

  const stateData = loginSession.state_data
    ? JSON.parse(loginSession.state_data)
    : {};

  await ctx.env.data.loginSessions.update(client.tenant.id, state, {
    state_data: JSON.stringify({
      ...stateData,
      webauthn_challenge: options.challenge,
    }),
  });

  return JSON.stringify(options);
}

export const passkeyEnrollmentScreenDefinition: ScreenDefinition = {
  id: "passkey-enrollment",
  name: "Passkey Enrollment",
  description: "WebAuthn passkey registration ceremony",
  handler: {
    get: async (context) => {
      const { ctx, client, state } = context;

      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (!loginSession || !loginSession.user_id) {
        return passkeyEnrollmentScreen(context);
      }

      // Allow passkey enrollment from continuation flow or MFA enrollment flow
      const stateData = loginSession.state_data
        ? JSON.parse(loginSession.state_data)
        : {};
      const isGuardianEnrollment = stateData.guardian_enrollment === true;
      const isContinuation = hasValidContinuationScope(
        loginSession,
        "passkey-enrollment",
      );
      if (
        !isGuardianEnrollment &&
        loginSession.state !== LoginSessionState.AWAITING_MFA &&
        !isContinuation
      ) {
        return passkeyEnrollmentScreen(context);
      }

      const user = await ctx.env.data.users.get(
        client.tenant.id,
        loginSession.user_id,
      );
      if (!user) {
        return passkeyEnrollmentScreen(context);
      }

      // Get existing passkey credentials to exclude
      const enrollments = await ctx.env.data.authenticationMethods.list(
        client.tenant.id,
        user.user_id,
      );
      const excludeCredentials = enrollments
        .filter(
          (e) => PASSKEY_TYPES.includes(e.type as (typeof PASSKEY_TYPES)[number]) && e.credential_id,
        )
        .map((e) => ({
          id: e.credential_id!,
          transports: (e.transports || []) as AuthenticatorTransport[],
        }));

      const rpId = getRpId(ctx);
      const rpName =
        client.tenant.friendly_name || client.tenant.id || "AuthHero";
      const userName = user.email || user.username || user.user_id;
      const userDisplayName = user.name || user.email || user.user_id;

      // Generate registration options (challenge is auto-generated by the library)
      const options = await generateRegistrationOptions({
        rpName,
        rpID: rpId,
        userName,
        userDisplayName,
        excludeCredentials,
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "preferred",
        },
        attestationType: "none",
        timeout: 60000,
      });

      // Store the challenge in state_data for verification
      await ctx.env.data.loginSessions.update(client.tenant.id, state, {
        state_data: JSON.stringify({
          ...stateData,
          webauthn_challenge: options.challenge,
        }),
      });

      logMessage(ctx, client.tenant.id, {
        type: LogTypes.MFA_ENROLL_STARTED,
        description: "Passkey enrollment started",
        userId: user.user_id,
      });

      return passkeyEnrollmentScreen(context, {
        optionsJSON: JSON.stringify(options),
        isGuardianEnrollment,
      });
    },

    post: async (context, data) => {
      const { ctx, client, state } = context;
      const action =
        (data.action as string) || (data["action-field"] as string) || "";
      const credentialJson = data["credential-field"] as string;

      const locale = context.language || "en";
      const { m } = createTranslation(
        "passkeys",
        "passkey-enrollment",
        locale,
        context.customText,
      );

      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );
      if (!loginSession || !loginSession.user_id) {
        return {
          screen: await passkeyEnrollmentScreen(context, {
            errorMessage: "Session not found",
          }),
        };
      }

      // Allow passkey enrollment from continuation flow or MFA enrollment flow
      const postStateData = loginSession.state_data
        ? JSON.parse(loginSession.state_data)
        : {};
      const isGuardianEnrollment = postStateData.guardian_enrollment === true;
      const isContinuation = hasValidContinuationScope(
        loginSession,
        "passkey-enrollment",
      );
      if (
        !isGuardianEnrollment &&
        loginSession.state !== LoginSessionState.AWAITING_MFA &&
        !isContinuation
      ) {
        return { screen: await passkeyEnrollmentScreen(context) };
      }

      // Handle skip action — resume auth flow without enrolling
      // Server-side guard: skip is only allowed in continuation flows (nudge).
      // Guardian enrollment and AWAITING_MFA are mandatory — skip must be rejected.
      if (action === "skip") {
        if (!isContinuation) {
          const optionsJSON = await generateFreshOptionsJSON(context);
          return {
            screen: await passkeyEnrollmentScreen(context, {
              optionsJSON,
              errorMessage: "Enrollment is required",
              isGuardianEnrollment,
            }),
          };
        }

        await completeLoginSessionContinuation(
          ctx,
          client.tenant.id,
          loginSession,
        );

        // Mark nudge as completed
        const currentSession = await ctx.env.data.loginSessions.get(
          client.tenant.id,
          state,
        );
        if (currentSession) {
          const sd = currentSession.state_data
            ? JSON.parse(currentSession.state_data)
            : {};
          await ctx.env.data.loginSessions.update(client.tenant.id, state, {
            state_data: JSON.stringify({
              ...sd,
              passkey_nudge_completed: true,
            }),
          });
        }

        // Update snooze so they aren't asked again immediately
        const user = await ctx.env.data.users.get(
          client.tenant.id,
          loginSession.user_id,
        );
        if (user) {
          await ctx.env.data.users.update(client.tenant.id, user.user_id, {
            app_metadata: {
              ...(user.app_metadata || {}),
              passkey_enrollment_snoozed_at: new Date().toISOString(),
            },
          });
        }

        // Resume auth flow
        const userForAuth = await ctx.env.data.users.get(
          client.tenant.id,
          loginSession.user_id,
        );
        if (!userForAuth) {
          return {
            screen: await passkeyEnrollmentScreen(context, {
              errorMessage: "User not found",
            }),
          };
        }
        const result = await createFrontChannelAuthResponse(ctx, {
          authParams: loginSession.authParams,
          user: userForAuth,
          client,
          loginSession,
          authConnection: loginSession.auth_connection,
        });
        const location = result.headers.get("location");
        const cookies = result.headers.getSetCookie?.() || [];
        if (location) return { redirect: location, cookies };
        return { response: result };
      }

      // Handle registration
      if (action !== "register" || !credentialJson) {
        const optionsJSON = await generateFreshOptionsJSON(context);
        return {
          screen: await passkeyEnrollmentScreen(context, {
            optionsJSON,
            errorMessage: m.errorMessage(),
          }),
        };
      }

      const stateData = loginSession.state_data
        ? JSON.parse(loginSession.state_data)
        : {};
      const expectedChallenge = stateData.webauthn_challenge as string;

      if (!expectedChallenge) {
        const optionsJSON = await generateFreshOptionsJSON(context);
        return {
          screen: await passkeyEnrollmentScreen(context, {
            optionsJSON,
            errorMessage: "Challenge expired. Please try again.",
          }),
        };
      }

      let credential;
      try {
        credential = JSON.parse(credentialJson);
      } catch {
        const optionsJSON = await generateFreshOptionsJSON(context);
        return {
          screen: await passkeyEnrollmentScreen(context, {
            optionsJSON,
            errorMessage: m.errorMessage(),
          }),
        };
      }

      const rpId = getRpId(ctx);
      const expectedOrigin = getExpectedOrigin(ctx);

      try {
        const verification = await verifyRegistrationResponse({
          response: credential,
          expectedChallenge,
          expectedOrigin,
          expectedRPID: rpId,
          requireUserVerification: false,
        });

        if (!verification.verified || !verification.registrationInfo) {
          logMessage(ctx, client.tenant.id, {
            type: LogTypes.WEBAUTHN_ENROLLMENT_FAILED,
            description: "Passkey enrollment verification failed",
            userId: loginSession.user_id,
          });
          const optionsJSON = await generateFreshOptionsJSON(context);
          return {
            screen: await passkeyEnrollmentScreen(context, {
              optionsJSON,
              errorMessage: m.errorMessage(),
            }),
          };
        }

        const { credential: webauthnCred, credentialBackedUp } =
          verification.registrationInfo;

        // Convert public key Uint8Array to base64url for storage
        const publicKeyBase64url = Buffer.from(webauthnCred.publicKey).toString(
          "base64url",
        );

        // Store the credential
        await ctx.env.data.authenticationMethods.create(client.tenant.id, {
          user_id: loginSession.user_id,
          type: "passkey",
          credential_id: webauthnCred.id,
          public_key: publicKeyBase64url,
          sign_count: webauthnCred.counter,
          credential_backed_up: credentialBackedUp,
          transports: credential.response?.transports || [],
          friendly_name: "Passkey",
          confirmed: true,
        });

        logMessage(ctx, client.tenant.id, {
          type: LogTypes.MFA_ENROLLMENT_COMPLETE,
          description: "Passkey enrollment completed",
          userId: loginSession.user_id,
        });

        // For ticket-based guardian enrollment, show success instead of resuming auth
        const successStateData = loginSession.state_data
          ? JSON.parse(loginSession.state_data)
          : {};
        if (successStateData.guardian_enrollment) {
          const successScreen: UiScreen = {
            name: "passkey-enrollment",
            action: "",
            method: "GET",
            title: m.title(),
            description: m.enrollmentComplete(),
            components: [],
          };
          return {
            screen: {
              screen: successScreen,
              branding: context.branding,
            },
          };
        }

        // Complete the continuation and resume auth flow
        await completeLoginSessionContinuation(
          ctx,
          client.tenant.id,
          loginSession,
        );

        // Mark nudge as completed
        const currentSession = await ctx.env.data.loginSessions.get(
          client.tenant.id,
          state,
        );
        if (currentSession) {
          const sd = currentSession.state_data
            ? JSON.parse(currentSession.state_data)
            : {};
          await ctx.env.data.loginSessions.update(client.tenant.id, state, {
            state_data: JSON.stringify({
              ...sd,
              passkey_nudge_completed: true,
            }),
          });
        }

        // Resume auth flow
        const user = await ctx.env.data.users.get(
          client.tenant.id,
          loginSession.user_id,
        );
        if (!user) {
          throw new Error("User not found");
        }

        const result = await createFrontChannelAuthResponse(ctx, {
          authParams: loginSession.authParams,
          user,
          client,
          loginSession,
          authConnection: loginSession.auth_connection,
        });

        const location = result.headers.get("location");
        const cookies = result.headers.getSetCookie?.() || [];
        if (location) return { redirect: location, cookies };
        return { response: result };
      } catch (err) {
        logMessage(ctx, client.tenant.id, {
          type: LogTypes.WEBAUTHN_ENROLLMENT_FAILED,
          description: `Passkey enrollment error: ${err instanceof Error ? err.message : "unknown"}`,
          userId: loginSession.user_id,
        });

        const optionsJSON = await generateFreshOptionsJSON(context);
        return {
          screen: await passkeyEnrollmentScreen(context, {
            optionsJSON,
            errorMessage: m.errorMessage(),
          }),
        };
      }
    },
  },
};
