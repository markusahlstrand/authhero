import { Context } from "hono";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { AuthParams, Client, User } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { SAMLResponseJSON } from "../types/saml";
import { XMLBuilder } from "fast-xml-parser";

export interface SAMLMetadataParams {
  entityId: string;
  assertionConsumerServiceUrl: string;
  singleLogoutServiceUrl: string;
  certificates: string[];
}

export interface SAMLResponseParams {
  destination: string;
  inResponseTo: string;
  audience: string;
  issuer: string;
  email: string;
  notBefore?: string;
  notAfter?: string;
  responseId?: string;
  assertionId?: string;
  sessionNotOnOrAfter?: string;
  issueInstant?: string;
  sessionIndex: string;
  userId: string;
  signature?: {
    privateKeyPem: string;
    cert: string;
    kid: string;
  };
  encode?: boolean;
}

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
  client: Client,
  authParams: AuthParams,
  user: User,
  sid: string,
) {
  if (!authParams.redirect_uri) {
    throw new HTTPException(400, {
      message: "Missing redirect_uri in authParams",
    });
  }

  if (!user.email) {
    throw new HTTPException(400, {
      message: "Missing email in user",
    });
  }

  // TODO: This should be a saml_encryption certificate soon
  const { signingKeys } = await ctx.env.data.keys.list({
    q: "type:jwt_signing",
  });

  const [signingKey] = signingKeys;
  if (!signingKey) {
    throw new HTTPException(500, {
      message: "No signing key found",
    });
  }

  if (!client.addons?.samlp) {
    throw new HTTPException(400, {
      message: `SAML Addon is not enabled for client ${client.id}`,
    });
  }

  const { recipient, audience } = client.addons.samlp;
  const inResponseTo = authParams.state || "";

  if (!recipient || !inResponseTo || !user || !authParams.state) {
    throw new HTTPException(400, {
      message: `Missing recipient or inResponseTo`,
    });
  }

  const state = JSON.parse(authParams.state);
  const redirectUrl = new URL(authParams.redirect_uri);

  const samlResponse = await createSamlResponse(ctx, {
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
  });

  return samlResponseForm(
    redirectUrl.toString(),
    samlResponse,
    state.relayState,
  );
}

export async function createSamlResponse(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  samlResponseParams: SAMLResponseParams,
): Promise<string> {
  const notBefore = samlResponseParams.notBefore || new Date().toISOString();
  const notAfter =
    samlResponseParams.notAfter ||
    new Date(new Date(notBefore).getTime() + 10 * 60 * 1000).toISOString();
  const issueInstant = samlResponseParams.issueInstant || notBefore;
  const sessionNotOnOrAfter =
    samlResponseParams.sessionNotOnOrAfter || notAfter;
  const responseId = samlResponseParams.responseId || `_${nanoid()}`;
  const assertionId = samlResponseParams.assertionId || `_${nanoid()}`;

  const samlResponseJson: SAMLResponseJSON = [
    {
      "samlp:Response": [
        {
          "saml:Issuer": [{ "#text": samlResponseParams.issuer }],
        },
        {
          "samlp:Status": [
            {
              "samlp:StatusCode": [],
              ":@": { "@_Value": "urn:oasis:names:tc:SAML:2.0:status:Success" },
            },
          ],
        },
        {
          "saml:Assertion": [
            {
              "saml:Issuer": [
                {
                  "#text": samlResponseParams.issuer,
                },
              ],
            },
            {
              "saml:Subject": [
                {
                  "saml:NameID": [{ "#text": samlResponseParams.email }],
                  ":@": {
                    "@_Format":
                      "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
                  },
                },
                {
                  "saml:SubjectConfirmation": [
                    {
                      "saml:SubjectConfirmationData": [],
                      ":@": {
                        "@_InResponseTo": samlResponseParams.inResponseTo,
                        "@_NotOnOrAfter": notAfter,
                        "@_Recipient": samlResponseParams.destination,
                      },
                    },
                  ],
                  ":@": { "@_Method": "urn:oasis:names:tc:SAML:2.0:cm:bearer" },
                },
              ],
            },
            {
              "saml:Conditions": [
                {
                  "saml:AudienceRestriction": [
                    {
                      "saml:Audience": [
                        {
                          "#text": samlResponseParams.audience,
                        },
                      ],
                    },
                  ],
                },
              ],
              ":@": {
                "@_NotBefore": notBefore,
                "@_NotOnOrAfter": notAfter,
              },
            },
            {
              "saml:AuthnStatement": [
                {
                  "saml:AuthnContext": [
                    {
                      "saml:AuthnContextClassRef": [
                        {
                          "#text":
                            "urn:oasis:names:tc:SAML:2.0:ac:classes:unspecified",
                        },
                      ],
                    },
                  ],
                },
              ],
              ":@": {
                "@_AuthnInstant": issueInstant,
                "@_SessionIndex": samlResponseParams.sessionIndex,
                "@_SessionNotOnOrAfter": sessionNotOnOrAfter,
              },
            },
            {
              "saml:AttributeStatement": [
                {
                  "saml:Attribute": [
                    {
                      "saml:AttributeValue": [
                        { "#text": samlResponseParams.userId },
                      ],
                      ":@": {
                        "@_xmlns:xs": "http://www.w3.org/2001/XMLSchema",
                        "@_xmlns:xsi":
                          "http://www.w3.org/2001/XMLSchema-instance",
                        "@_xsi:type": "xs:string",
                      },
                    },
                  ],
                  ":@": {
                    "@_FriendlyName": "persistent",
                    "@_Name": "id",
                    "@_NameFormat":
                      "urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified",
                  },
                },
                {
                  "saml:Attribute": [
                    {
                      "saml:AttributeValue": [
                        { "#text": samlResponseParams.email },
                      ],
                      ":@": {
                        "@_xmlns:xs": "http://www.w3.org/2001/XMLSchema",
                        "@_xmlns:xsi":
                          "http://www.w3.org/2001/XMLSchema-instance",
                        "@_xsi:type": "xs:string",
                      },
                    },
                  ],
                  ":@": {
                    "@_Name": "email",
                    "@_NameFormat":
                      "urn:oasis:names:tc:SAML:2.0:attrname-format:basic",
                  },
                },
                {
                  "saml:Attribute": [
                    {
                      "saml:AttributeValue": [{ "#text": "manage-account" }],
                      ":@": {
                        "@_xmlns:xs": "http://www.w3.org/2001/XMLSchema",
                        "@_xmlns:xsi":
                          "http://www.w3.org/2001/XMLSchema-instance",
                        "@_xsi:type": "xs:string",
                      },
                    },
                  ],
                  ":@": {
                    "@_Name": "Role",
                    "@_NameFormat":
                      "urn:oasis:names:tc:SAML:2.0:attrname-format:basic",
                  },
                },
                {
                  "saml:Attribute": [
                    {
                      "saml:AttributeValue": [
                        { "#text": "default-roles-master" },
                      ],
                      ":@": {
                        "@_xmlns:xs": "http://www.w3.org/2001/XMLSchema",
                        "@_xmlns:xsi":
                          "http://www.w3.org/2001/XMLSchema-instance",
                        "@_xsi:type": "xs:string",
                      },
                    },
                  ],
                  ":@": {
                    "@_Name": "Role",
                    "@_NameFormat":
                      "urn:oasis:names:tc:SAML:2.0:attrname-format:basic",
                  },
                },
                {
                  "saml:Attribute": [
                    {
                      "saml:AttributeValue": [{ "#text": "offline_access" }],
                      ":@": {
                        "@_xmlns:xs": "http://www.w3.org/2001/XMLSchema",
                        "@_xmlns:xsi":
                          "http://www.w3.org/2001/XMLSchema-instance",
                        "@_xsi:type": "xs:string",
                      },
                    },
                  ],
                  ":@": {
                    "@_Name": "Role",
                    "@_NameFormat":
                      "urn:oasis:names:tc:SAML:2.0:attrname-format:basic",
                  },
                },
                {
                  "saml:Attribute": [
                    {
                      "saml:AttributeValue": [{ "#text": "view-profile" }],
                      ":@": {
                        "@_xmlns:xs": "http://www.w3.org/2001/XMLSchema",
                        "@_xmlns:xsi":
                          "http://www.w3.org/2001/XMLSchema-instance",
                        "@_xsi:type": "xs:string",
                      },
                    },
                  ],
                  ":@": {
                    "@_Name": "Role",
                    "@_NameFormat":
                      "urn:oasis:names:tc:SAML:2.0:attrname-format:basic",
                  },
                },
                {
                  "saml:Attribute": [
                    {
                      "saml:AttributeValue": [{ "#text": "uma_authorization" }],
                      ":@": {
                        "@_xmlns:xs": "http://www.w3.org/2001/XMLSchema",
                        "@_xmlns:xsi":
                          "http://www.w3.org/2001/XMLSchema-instance",
                        "@_xsi:type": "xs:string",
                      },
                    },
                  ],
                  ":@": {
                    "@_Name": "Role",
                    "@_NameFormat":
                      "urn:oasis:names:tc:SAML:2.0:attrname-format:basic",
                  },
                },
                {
                  "saml:Attribute": [
                    {
                      "saml:AttributeValue": [
                        { "#text": "manage-account-links" },
                      ],
                      ":@": {
                        "@_xmlns:xs": "http://www.w3.org/2001/XMLSchema",
                        "@_xmlns:xsi":
                          "http://www.w3.org/2001/XMLSchema-instance",
                        "@_xsi:type": "xs:string",
                      },
                    },
                  ],
                  ":@": {
                    "@_Name": "Role",
                    "@_NameFormat":
                      "urn:oasis:names:tc:SAML:2.0:attrname-format:basic",
                  },
                },
              ],
            },
          ],
          ":@": {
            "@_xmlns": "urn:oasis:names:tc:SAML:2.0:assertion",
            "@_ID": assertionId,
            "@_IssueInstant": issueInstant,
            "@_Version": "2.0",
          },
        },
      ],
      ":@": {
        "@_xmlns:samlp": "urn:oasis:names:tc:SAML:2.0:protocol",
        "@_xmlns:saml": "urn:oasis:names:tc:SAML:2.0:assertion",
        "@_Destination": samlResponseParams.destination,
        "@_ID": responseId,
        "@_InResponseTo": samlResponseParams.inResponseTo,
        "@_IssueInstant": issueInstant,
        "@_Version": "2.0",
      },
    },
  ];

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    suppressEmptyNode: true,
    preserveOrder: true,
  });

  // Generate XML
  let xmlContent = builder.build(samlResponseJson);

  if (samlResponseParams.signature) {
    const response = await fetch(ctx.env.SAML_SIGN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        xmlContent,
        privateKey: samlResponseParams.signature.privateKeyPem,
        publicCert: samlResponseParams.signature.cert,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to sign SAML response: ${response.status}`);
    }

    xmlContent = await response.text();
  }

  if (samlResponseParams.encode === false) {
    return xmlContent;
  }

  const encodedResponse = btoa(xmlContent);

  return encodedResponse;
}
