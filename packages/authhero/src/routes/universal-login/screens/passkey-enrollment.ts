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
      href: `javascript:void(function(){var f=document.querySelector('form');if(f){document.getElementById('action-field').value='skip';f.submit()}}())`,
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

  // Build WebAuthn script to run at page level
  let extraScript: string | undefined;
  if (extra?.optionsJSON) {
    const safeOptions = extra.optionsJSON.replace(/</g, "\\u003c");
    extraScript = `(async function(){
  var opts=${safeOptions};
  function b64u2buf(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var b=atob(s),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a.buffer}
  function buf2b64u(b){var a=new Uint8Array(b),s='';for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')}
  try{
    var pk={publicKey:{
      challenge:b64u2buf(opts.challenge),
      rp:{id:opts.rp.id,name:opts.rp.name},
      user:{id:b64u2buf(opts.user.id),name:opts.user.name,displayName:opts.user.displayName},
      pubKeyCredParams:opts.pubKeyCredParams,
      timeout:opts.timeout,
      attestation:opts.attestation||'none',
      authenticatorSelection:opts.authenticatorSelection||{residentKey:'preferred',userVerification:'preferred'}
    }};
    if(opts.excludeCredentials&&opts.excludeCredentials.length){
      pk.publicKey.excludeCredentials=opts.excludeCredentials.map(function(c){return{id:b64u2buf(c.id),type:c.type,transports:c.transports}});
    }
    var cred=await navigator.credentials.create(pk);
    var resp={
      id:cred.id,
      rawId:buf2b64u(cred.rawId),
      type:cred.type,
      response:{
        attestationObject:buf2b64u(cred.response.attestationObject),
        clientDataJSON:buf2b64u(cred.response.clientDataJSON)
      },
      clientExtensionResults:cred.getClientExtensionResults(),
      authenticatorAttachment:cred.authenticatorAttachment||undefined
    };
    if(cred.response.getTransports)resp.response.transports=cred.response.getTransports();
    var form=document.querySelector('form');
    if(!form){var w=document.querySelector('authhero-widget');if(w&&w.shadowRoot)form=w.shadowRoot.querySelector('form')}
    if(form){
      var cf=form.querySelector('[name="credential-field"]')||form.querySelector('#credential-field');
      var af=form.querySelector('[name="action-field"]')||form.querySelector('#action-field');
      if(cf)cf.value=JSON.stringify(resp);
      if(af)af.value='register';
      form.submit();
    }
  }catch(e){
    console.error('WebAuthn registration error:',e);
  }
})();`;
  }

  return { screen, branding, extraScript };
}

/**
 * Extract the RP ID from the host — strips port and uses the root domain.
 * Must use the actual request host (not custom_domain) because WebAuthn
 * requires rp.id to match the browser's current origin.
 */
function getRpId(ctx: any): string {
  const host = ctx.req.header("host") || "localhost";
  // Strip port if present
  return host.split(":")[0];
}

/**
 * Get the origin URL for WebAuthn verification.
 * Must use the actual request host to match the browser's origin.
 */
function getExpectedOrigin(ctx: any): string {
  const host = ctx.req.header("host") || "localhost";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
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
  const passkeyTypes = ["passkey", "webauthn-roaming", "webauthn-platform"];
  const excludeCredentials = enrollments
    .filter((e) => passkeyTypes.includes(e.type) && e.credential_id)
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
      const passkeyTypes = ["passkey", "webauthn-roaming", "webauthn-platform"];
      const excludeCredentials = enrollments
        .filter((e) => passkeyTypes.includes(e.type) && e.credential_id)
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
      const action = data.action as string;
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
      if (action === "skip") {
        if (isContinuation) {
          await completeLoginSessionContinuation(
            ctx,
            client.tenant.id,
            loginSession,
          );
        }

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
            description:
              "Your passkey has been set up successfully. You can close this page.",
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
