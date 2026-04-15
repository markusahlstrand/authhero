/**
 * Shared WebAuthn/passkey utilities used by passkey-enrollment, account-passkeys,
 * passkey-challenge, and conditional mediation on identifier/login screens.
 */

import { LoginSessionState, LogTypes, Strategy } from "@authhero/adapter-interfaces";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { logMessage } from "../../../helpers/logging";
import {
  transitionLoginSession,
  LoginSessionEventType,
} from "../../../state-machines/login-session";
import type { WebAuthnCeremony, ScreenContext } from "./types";

export const PASSKEY_TYPES = [
  "passkey",
  "webauthn-roaming",
  "webauthn-platform",
] as const;

/**
 * Extract the RP ID from the host — strips port and uses the root domain.
 * Must use the actual request host (not custom_domain) because WebAuthn
 * requires rp.id to match the browser's current origin.
 */
export function getRpId(ctx: any): string {
  const host = ctx.var.host || "localhost";
  // Strip port if present
  return host.split(":")[0];
}

/**
 * Get the origin URL for WebAuthn verification.
 * Must use the actual request host to match the browser's origin.
 */
export function getExpectedOrigin(ctx: any): string {
  const host = ctx.var.host || "localhost";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

/**
 * Build the inline JavaScript that triggers navigator.credentials.create()
 * and auto-submits the form with the credential result.
 *
 * @param optionsJSON - JSON string of WebAuthn registration options
 * @param successAction - The action value to set on successful registration (default: "register")
 */
export function buildWebAuthnRegistrationScript(
  optionsJSON: string,
  successAction = "register",
): string {
  const safeOptions = JSON.stringify(optionsJSON).replace(/</g, "\\u003c");
  return `(async function(){
  var opts=JSON.parse(${safeOptions});
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
      if(af)af.value='${successAction}';
      form.submit();
    }
  }catch(e){
    console.error('WebAuthn registration error:',e);
    var form=document.querySelector('form');
    if(!form){var w=document.querySelector('authhero-widget');if(w&&w.shadowRoot)form=w.shadowRoot.querySelector('form')}
    if(form){
      var af=form.querySelector('[name="action-field"]')||form.querySelector('#action-field');
      if(af)af.value='error';
      form.submit();
    }
  }
})();`;
}

/**
 * Build a structured WebAuthn ceremony object for the widget SPA flow.
 * The widget validates the shape and performs the ceremony natively
 * instead of executing arbitrary script content.
 *
 * @param optionsJSON - JSON string of WebAuthn registration options
 * @param successAction - The action value to set on successful registration (default: "register")
 */
export function buildWebAuthnCeremony(
  optionsJSON: string,
  successAction = "register",
): WebAuthnCeremony {
  const options = JSON.parse(optionsJSON);
  return {
    type: "webauthn-registration",
    options: {
      challenge: options.challenge,
      rp: { id: options.rp.id, name: options.rp.name },
      user: {
        id: options.user.id,
        name: options.user.name,
        displayName: options.user.displayName,
      },
      pubKeyCredParams: options.pubKeyCredParams,
      timeout: options.timeout,
      attestation: options.attestation || "none",
      authenticatorSelection: options.authenticatorSelection || {
        residentKey: "preferred",
        userVerification: "preferred",
      },
      excludeCredentials: options.excludeCredentials,
    },
    successAction,
  };
}

/**
 * Build the inline JavaScript that triggers navigator.credentials.get()
 * for passkey authentication (login) and auto-submits the form.
 *
 * @param optionsJSON - JSON string of WebAuthn authentication options
 * @param successAction - The action value to set on successful authentication (default: "authenticate")
 */
export function buildWebAuthnAuthenticationScript(
  optionsJSON: string,
  successAction = "authenticate",
): string {
  const safeOptions = JSON.stringify(optionsJSON).replace(/</g, "\\u003c");
  return `(async function(){
  var opts=JSON.parse(${safeOptions});
  function b64u2buf(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var b=atob(s),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a.buffer}
  function buf2b64u(b){var a=new Uint8Array(b),s='';for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')}
  try{
    var pk={publicKey:{
      challenge:b64u2buf(opts.challenge),
      rpId:opts.rpId,
      timeout:opts.timeout,
      userVerification:opts.userVerification||'preferred'
    }};
    if(opts.allowCredentials&&opts.allowCredentials.length){
      pk.publicKey.allowCredentials=opts.allowCredentials.map(function(c){return{id:b64u2buf(c.id),type:c.type,transports:c.transports}});
    }
    var cred=await navigator.credentials.get(pk);
    var resp={
      id:cred.id,
      rawId:buf2b64u(cred.rawId),
      type:cred.type,
      response:{
        authenticatorData:buf2b64u(cred.response.authenticatorData),
        clientDataJSON:buf2b64u(cred.response.clientDataJSON),
        signature:buf2b64u(cred.response.signature)
      },
      clientExtensionResults:cred.getClientExtensionResults(),
      authenticatorAttachment:cred.authenticatorAttachment||undefined
    };
    if(cred.response.userHandle)resp.response.userHandle=buf2b64u(cred.response.userHandle);
    var form=document.querySelector('form');
    if(!form){var w=document.querySelector('authhero-widget');if(w&&w.shadowRoot)form=w.shadowRoot.querySelector('form')}
    if(form){
      var cf=form.querySelector('[name="credential-field"]')||form.querySelector('#credential-field');
      var af=form.querySelector('[name="action-field"]')||form.querySelector('#action-field');
      if(cf)cf.value=JSON.stringify(resp);
      if(af)af.value='${successAction}';
      form.submit();
    }
  }catch(e){
    console.error('WebAuthn authentication error:',e);
    var form=document.querySelector('form');
    if(!form){var w=document.querySelector('authhero-widget');if(w&&w.shadowRoot)form=w.shadowRoot.querySelector('form')}
    if(form){
      var af=form.querySelector('[name="action-field"]')||form.querySelector('#action-field');
      if(af)af.value='error';
      form.submit();
    }
  }
})();`;
}

/**
 * Build a structured WebAuthn authentication ceremony object for the widget SPA flow.
 *
 * @param optionsJSON - JSON string of WebAuthn authentication options
 * @param successAction - The action value to set on successful authentication (default: "authenticate")
 */
export function buildWebAuthnAuthenticationCeremony(
  optionsJSON: string,
  successAction = "authenticate",
): WebAuthnCeremony {
  const options = JSON.parse(optionsJSON);
  return {
    type: "webauthn-authentication",
    options: {
      challenge: options.challenge,
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: options.userVerification || "preferred",
      allowCredentials: options.allowCredentials,
    },
    successAction,
  };
}

/**
 * Build a structured WebAuthn conditional mediation ceremony object for the widget SPA flow.
 * Conditional mediation shows passkey suggestions in the username field's autofill dropdown.
 *
 * @param optionsJSON - JSON string of WebAuthn authentication options
 * @param successAction - The action value to set on successful authentication (default: "passkey-authenticate")
 */
export function buildWebAuthnConditionalMediationCeremony(
  optionsJSON: string,
  successAction = "passkey-authenticate",
): WebAuthnCeremony {
  const options = JSON.parse(optionsJSON);
  return {
    type: "webauthn-authentication-conditional",
    options: {
      challenge: options.challenge,
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: options.userVerification || "preferred",
    },
    successAction,
  };
}

/**
 * Build inline JavaScript for conditional mediation (autofill-assisted passkeys).
 * This script runs on page load and silently offers passkey suggestions in the
 * username field's autofill dropdown via `navigator.credentials.get({ mediation: "conditional" })`.
 *
 * @param optionsJSON - JSON string of WebAuthn authentication options
 * @param successAction - The action value to set on successful authentication (default: "passkey-authenticate")
 */
export function buildConditionalMediationScript(
  optionsJSON: string,
  successAction = "passkey-authenticate",
): string {
  const safeOptions = JSON.stringify(optionsJSON).replace(/</g, "\\u003c");
  return `(async function(){
  if(!window.PublicKeyCredential||!PublicKeyCredential.isConditionalMediationAvailable)return;
  var ok=await PublicKeyCredential.isConditionalMediationAvailable();
  if(!ok)return;
  var opts=JSON.parse(${safeOptions});
  function b64u2buf(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var b=atob(s),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a.buffer}
  function buf2b64u(b){var a=new Uint8Array(b),s='';for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')}
  try{
    var pk={publicKey:{
      challenge:b64u2buf(opts.challenge),
      rpId:opts.rpId,
      timeout:opts.timeout,
      userVerification:opts.userVerification||'preferred'
    },mediation:'conditional'};
    var cred=await navigator.credentials.get(pk);
    var resp={
      id:cred.id,
      rawId:buf2b64u(cred.rawId),
      type:cred.type,
      response:{
        authenticatorData:buf2b64u(cred.response.authenticatorData),
        clientDataJSON:buf2b64u(cred.response.clientDataJSON),
        signature:buf2b64u(cred.response.signature)
      },
      clientExtensionResults:cred.getClientExtensionResults(),
      authenticatorAttachment:cred.authenticatorAttachment||undefined
    };
    if(cred.response.userHandle)resp.response.userHandle=buf2b64u(cred.response.userHandle);
    var form=document.querySelector('form');
    if(!form){var w=document.querySelector('authhero-widget');if(w&&w.shadowRoot)form=w.shadowRoot.querySelector('form')}
    if(form){
      var cf=form.querySelector('[name="credential-field"]')||form.querySelector('#credential-field');
      var af=form.querySelector('[name="action-field"]')||form.querySelector('#action-field');
      if(cf)cf.value=JSON.stringify(resp);
      if(af)af.value='${successAction}';
      form.submit();
    }
  }catch(e){
    if(e.name==='AbortError'||e.name==='NotAllowedError')return;
    console.error('Conditional mediation error:',e);
  }
})();`;
}

/**
 * Result type for passkey verification
 */
export type PasskeyVerificationResult =
  | {
      success: true;
      user: any;
      primaryUser: any;
      loginSession: any;
      authConnection: string;
    }
  | { success: false; error: string };

/**
 * Shared passkey authentication verification logic.
 * Used by both passkey-challenge screen (MFA) and identifier/login screens (conditional mediation).
 *
 * Verifies the WebAuthn assertion response, resolves the user, and updates session state.
 */
export async function verifyPasskeyAuthentication(
  context: ScreenContext,
  credentialJson: string,
): Promise<PasskeyVerificationResult> {
  const { ctx, client, state } = context;

  const loginSession = await ctx.env.data.loginSessions.get(
    client.tenant.id,
    state,
  );
  if (!loginSession) {
    return { success: false, error: "Session not found" };
  }

  const stateData = loginSession.state_data
    ? JSON.parse(loginSession.state_data)
    : {};
  const expectedChallenge = stateData.webauthn_challenge as string;

  if (!expectedChallenge) {
    return { success: false, error: "Challenge expired" };
  }

  let credential;
  try {
    credential = JSON.parse(credentialJson);
  } catch {
    return { success: false, error: "Invalid credential" };
  }

  // Look up the authentication method by credential ID
  const authMethod = await ctx.env.data.authenticationMethods.getByCredentialId(
    client.tenant.id,
    credential.id,
  );

  if (!authMethod || !authMethod.public_key || !authMethod.confirmed) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_LOGIN,
      description: "Passkey not found or not confirmed",
    });
    return { success: false, error: "Passkey not found" };
  }

  const rpId = getRpId(ctx);
  const expectedOrigin = getExpectedOrigin(ctx);

  try {
    const publicKeyBytes = Buffer.from(authMethod.public_key, "base64url");

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpId,
      credential: {
        id: authMethod.credential_id!,
        publicKey: new Uint8Array(publicKeyBytes),
        counter: authMethod.sign_count || 0,
        transports: (authMethod.transports || []) as AuthenticatorTransport[],
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_LOGIN,
        description: "Passkey verification failed",
      });
      return { success: false, error: "Verification failed" };
    }

    // Update sign count for clone detection
    await ctx.env.data.authenticationMethods.update(
      client.tenant.id,
      authMethod.id,
      {
        sign_count: verification.authenticationInfo.newCounter,
      },
    );

    // Get the user associated with this passkey
    const user = await ctx.env.data.users.get(
      client.tenant.id,
      authMethod.user_id,
    );

    if (!user) {
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_LOGIN,
        description: "User not found for passkey",
      });
      return { success: false, error: "User not found" };
    }

    // Resolve to primary user if linked
    const primaryUser = user.linked_to
      ? await ctx.env.data.users.get(client.tenant.id, user.linked_to)
      : user;

    if (!primaryUser) {
      return { success: false, error: "User not found" };
    }

    logMessage(ctx, client.tenant.id, {
      type: LogTypes.SUCCESS_LOGIN,
      description: "Passkey authentication successful",
      userId: primaryUser.user_id,
    });

    // Transition from AWAITING_MFA back to AUTHENTICATED if needed,
    // and set mfa_verified so createFrontChannelAuthResponse won't re-trigger MFA.
    const currentState = loginSession.state || LoginSessionState.PENDING;
    const updateFields: Record<string, unknown> = {
      user_id: primaryUser.user_id,
      state_data: JSON.stringify({
        ...stateData,
        mfa_verified: true,
      }),
    };
    if (currentState === LoginSessionState.AWAITING_MFA) {
      const { state: newState } = transitionLoginSession(
        currentState as LoginSessionState,
        { type: LoginSessionEventType.COMPLETE_MFA },
      );
      updateFields.state = newState;
    }
    await ctx.env.data.loginSessions.update(
      client.tenant.id,
      state,
      updateFields,
    );

    return {
      success: true,
      user,
      primaryUser,
      loginSession,
      authConnection: user.connection || Strategy.USERNAME_PASSWORD,
    };
  } catch (err) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_LOGIN,
      description: `Passkey authentication error: ${err instanceof Error ? err.message : "unknown"}`,
    });
    return { success: false, error: "Authentication failed" };
  }
}
