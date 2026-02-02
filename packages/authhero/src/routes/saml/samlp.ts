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

export const samlpRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /samlp/metadata/{client_id}
  // --------------------------------
  .openapi(
    createRoute({
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
    async (ctx) => {
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
  )
  // --------------------------------
  // GET /samlp/{client_id}
  // --------------------------------
  .openapi(
    createRoute({
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
    async (ctx) => {
      const { client_id } = ctx.req.valid("param");
      const { SAMLRequest, RelayState } = ctx.req.valid("query");

      const client = await getEnrichedClient(ctx.env, client_id);
      ctx.set("client_id", client.client_id);
      setTenantId(ctx, client.tenant.id);

      // TODO: Validate the Signature and SigAlg if provided

      const samlRequest = await parseSamlRequestQuery(SAMLRequest);
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
            redirect_uri:
              // TODO: validate this URL against the saml settings
              samlRequest["samlp:AuthnRequest"][
                "@_AssertionConsumerServiceURL"
              ],
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
  );
