import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS } from "../../constants";
import { X509Certificate } from "@peculiar/x509";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../../types";
import { AuthorizationResponseMode } from "@authhero/adapter-interfaces";
import { createSamlMetadata, parseSamlRequestQuery } from "../../helpers/saml";

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

      const client = await ctx.env.data.clients.get(client_id);

      if (!client) {
        throw new HTTPException(404, {
          message: "Client not found",
        });
      }

      // TODO: Get the most recent signing key
      const [signingKey] = await ctx.env.data.keys.list();

      if (!signingKey) {
        throw new HTTPException(500, {
          message: "No signing key found",
        });
      }

      const cert = new X509Certificate(signingKey.cert);

      const issuer = ctx.env.ISSUER;

      const metadata = createSamlMetadata({
        entityId: client.addons?.samlp?.audience || client.id,
        cert: cert.toString("base64"),
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
          auth0Client: (() => {
            const auth0_client = ctx.get("auth0_client");
            return auth0_client
              ? `${auth0_client.name}/${auth0_client.version}${auth0_client.env?.node ? ` (env: node/${auth0_client.env.node})` : ""}`
              : undefined;
          })(),
        },
      );

      return ctx.redirect(`/u/login/identifier?state=${loginSession.id}`);
    },
  );
