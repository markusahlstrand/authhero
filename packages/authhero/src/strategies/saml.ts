import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { AuthParams, User } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import { JSONHTTPException } from "../errors/json-http-exception";
// Use core import to avoid xml-crypto dependency
import { createSamlResponse, HttpSamlSigner } from "@authhero/saml/core";

export function samlResponseForm(
  postUrl: string,
  base64EncodedSaml: string,
  relayState?: string,
) {
  const relayStateInput = relayState
    ? `<input type="hidden" name="RelayState" value="${relayState}" />`
    : "";

  const samlResponseTempate = `
  <!DOCTYPE html>
  <html>
  <body onload="document.forms[0].submit()">
      <noscript>
          <p>Your browser has JavaScript disabled. Please click the button below to continue:</p>
          <input type="submit" value="Continue">
      </noscript>
      <form method="post" action="${postUrl}">
          <input type="hidden" name="SAMLResponse" value="${base64EncodedSaml}" />  
          ${relayStateInput}      
      </form>
      <script>
      window.onload = function() {{
          document.forms[0].submit();
      }};
      </script>
  </body>
  </html>`;

  return new Response(samlResponseTempate, {
    headers: {
      "Content-Type": "text/html",
    },
  });
}

export async function samlCallback(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: EnrichedClient,
  authParams: AuthParams,
  user: User,
  sid: string,
) {
  if (!authParams.redirect_uri) {
    throw new JSONHTTPException(400, {
      message: "Missing redirect_uri in authParams",
    });
  }

  if (!user.email) {
    throw new JSONHTTPException(400, {
      message: "Missing email in user",
    });
  }

  const { signingKeys } = await ctx.env.data.keys.list({
    q: "type:saml_encryption",
  });

  const [signingKey] = signingKeys;
  if (!signingKey) {
    throw new JSONHTTPException(500, {
      message: "No signing key found",
    });
  }

  if (!client.addons?.samlp) {
    throw new JSONHTTPException(400, {
      message: `SAML Addon is not enabled for client ${client.client_id}`,
    });
  }

  const { recipient, audience } = client.addons.samlp;
  const inResponseTo = authParams.state || "";

  if (!recipient || !inResponseTo || !user || !authParams.state) {
    throw new JSONHTTPException(400, {
      message: `Missing recipient or inResponseTo`,
    });
  }

  const state = JSON.parse(authParams.state);
  const redirectUrl = new URL(authParams.redirect_uri);

  // Priority order for SAML signer:
  // 1. Configured signer instance (ctx.env.samlSigner)
  // 2. HTTP signer via SAML_SIGN_URL
  // 3. undefined (no signing - for testing or when signature is not required)
  const signer =
    ctx.env.samlSigner ||
    (ctx.env.SAML_SIGN_URL
      ? new HttpSamlSigner(ctx.env.SAML_SIGN_URL)
      : undefined);

  const samlResponse = await createSamlResponse(
    {
      issuer: ctx.env.ISSUER,
      audience: audience || authParams.client_id,
      destination: redirectUrl.toString(),
      inResponseTo: state.requestId,
      userId: user.app_metadata?.vimeo?.user_id || user.user_id,
      email: user.email,
      sessionIndex: sid!,
      signature: {
        privateKeyPem: signingKey.pkcs7!,
        cert: signingKey.cert,
        kid: signingKey.kid,
      },
    },
    signer,
  );

  return samlResponseForm(
    redirectUrl.toString(),
    samlResponse,
    state.relayState,
  );
}
