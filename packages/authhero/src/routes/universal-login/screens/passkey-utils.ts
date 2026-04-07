/**
 * Shared WebAuthn/passkey utilities used by passkey-enrollment and account-passkeys screens
 */

import type { WebAuthnCeremony } from "./types";

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
