import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS } from "../../constants";
import { X509Certificate } from "@peculiar/x509";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../../types";
import { AuthorizationResponseMode } from "@authhero/adapter-interfaces";
import { createSamlMetadata, parseSamlRequestQuery } from "../../helpers/saml";
import { stringifyAuth0Client } from "../../utils/client-info";
import { setTenantId } from "../../helpers/set-tenant-id";
import { getEnrichedClient } from "../../helpers/client";
import { isValidRedirectUrl } from "../../utils/is-valid-redirect-url";
import { JSONHTTPException } from "../../errors/json-http-exception";
import { defineRoute } from "../../utils/define-route";
const getMetadataByClient_id = defineRoute({
  route: createRoute({
    tags: ["saml"],
    method: "get",
    path: "/metadata/{client_id}",
    request: {
      params: z.object({
        client_id: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Decoded SAML Request",
        content: {
          "text/xml": {
            schema: z.string(),
          },
        },
      },
      400: {
        description: "Bad Request",
      },
    },
  }),
  handler: async (ctx) => {
    const { client_id } = ctx.req.valid("param");

    const client = await getEnrichedClient(ctx.env, client_id);

    const { signingKeys } = await ctx.env.data.keys.list({
      q: "type:saml_encryption",
    });

    if (signingKeys.length === 0) {
      throw new HTTPException(500, {
        message: "No signing key found",
      });
    }

    const certificates = signingKeys.map((signingKey) =>
      new X509Certificate(signingKey.cert).toString("base64"),
    );

    const issuer = ctx.env.ISSUER;

    const metadata = createSamlMetadata({
      entityId: client.addons?.samlp?.audience || client.client_id,
      certificates,
      assertionConsumerServiceUrl: `${issuer}samlp/${client_id}`,
      singleLogoutServiceUrl: `${issuer}samlp/${client_id}/logout`,
    });

    return new Response(metadata, {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  },
});

const getByClient_id = defineRoute({
  route: createRoute({
    tags: ["saml"],
    method: "get",
    path: "/{client_id}",
    request: {
      query: z.object({
        SAMLRequest: z.string(),
        RelayState: z.string().optional(),
        SigAlg: z.string().optional(),
        Signature: z.string().optional(),
      }),
      params: z.object({
        client_id: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Decoded SAML Request",
        content: {
          "text/xml": {
            schema: z.string(),
          },
        },
      },
      400: {
        description: "Bad Request",
      },
    },
  }),
  handler: async (ctx) => {
    const { client_id } = ctx.req.valid("param");
    const { SAMLRequest, RelayState, Signature } = ctx.req.valid("query");

    const client = await getEnrichedClient(ctx.env, client_id);
    ctx.set("client_id", client.client_id);
    setTenantId(ctx, client.tenant.id);

    const samlRequest = await parseSamlRequestQuery(SAMLRequest);

    // Defense in depth: an unsigned SAMLRequest is only acceptable when the
    // client config has not declared that requests must be signed. We don't
    // (yet) verify the signature itself — that requires xml-crypto and the
    // SP's public key — but if the deployer has flagged this client as
    // expecting signed requests, refuse rather than silently accept unsigned
    // input. Better to fail closed than create the illusion of authentication.
    const samlpAddon = client.addons?.samlp as
      | { require_signed_requests?: boolean }
      | undefined;
    if (samlpAddon?.require_signed_requests && !Signature) {
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description:
          "SAMLRequest must be signed for this client (require_signed_requests is enabled)",
      });
    }

    // Validate the AssertionConsumerServiceURL against the client's registered
    // callbacks before storing it as `redirect_uri` on the login session — the
    // SAMLResponse will eventually be POST'd to this URL. Without this check
    // an attacker can submit a forged SAMLRequest pointing at their own ACS
    // URL and harvest the issued SAMLResponse (containing the user's identity
    // assertion) after the victim completes Universal Login.
    const acsUrl =
      samlRequest["samlp:AuthnRequest"]["@_AssertionConsumerServiceURL"];
    if (!acsUrl) {
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description:
          "AssertionConsumerServiceURL is required on the SAMLRequest",
      });
    }
    if (
      !isValidRedirectUrl(acsUrl, client.callbacks || [], {
        allowPathWildcards: true,
        allowSubDomainWildcards: true,
      })
    ) {
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description:
          "AssertionConsumerServiceURL is not in the client's allowed callbacks",
      });
    }

    const issuer = samlRequest["samlp:AuthnRequest"]["saml:Issuer"]["#text"];

    // Create a new Login session
    const loginSession = await ctx.env.data.loginSessions.create(
      ctx.var.tenant_id,
      {
        csrf_token: nanoid(),
        authParams: {
          client_id: client_id,
          state: JSON.stringify({
            requestId: samlRequest["samlp:AuthnRequest"]["@_ID"],
            relayState: RelayState,
          }),
          response_mode: AuthorizationResponseMode.SAML_POST,
          redirect_uri: acsUrl,
          audience: issuer,
        },
        expires_at: new Date(
          Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
        ).toISOString(),
        ip: ctx.get("ip"),
        useragent: ctx.get("useragent"),
        auth0Client: stringifyAuth0Client(ctx.get("auth0_client")),
      },
    );

    return ctx.redirect(`/u/login/identifier?state=${loginSession.id}`);
  },
});

export const samlpRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getMetadataByClient_id, getByClient_id] as const);
