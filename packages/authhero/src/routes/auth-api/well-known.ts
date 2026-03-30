import {
  jwksKeySchema,
  openIDConfigurationSchema,
} from "@authhero/adapter-interfaces";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { JWKS_CACHE_TIMEOUT_IN_SECONDS } from "../../constants";
import { Bindings, Variables } from "../../types";
import { getAuthUrl, getIssuer } from "../../variables";
import { getJwksFromDatabase } from "../../utils/jwks";

export const wellKnownRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /.well-known/jwks.json
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["well known"],
      method: "get",
      path: "/jwks.json",
      request: {},
      responses: {
        200: {
          content: {
            "application/json": {
              schema: jwksKeySchema,
            },
          },
          description: "List of tenants",
        },
      },
    }),
    async (ctx) => {
      const keys = await getJwksFromDatabase(ctx.env.data);

      return ctx.json(
        { keys },
        {
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-method": "GET",
            "cache-control": `public, max-age=${JWKS_CACHE_TIMEOUT_IN_SECONDS}, stale-while-revalidate=${JWKS_CACHE_TIMEOUT_IN_SECONDS * 2
              }, stale-if-error=86400`,
          },
        },
      );
    },
  )
  // --------------------------------
  // GET /.well-known/openid-configuration
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["well known"],
      method: "get",
      path: "/openid-configuration",
      request: {},
      responses: {
        200: {
          content: {
            "application/json": {
              schema: openIDConfigurationSchema,
            },
          },
          description: "List of tenants",
        },
      },
    }),
    async (ctx) => {
      const customDomain = ctx.var.custom_domain;
      const result = openIDConfigurationSchema.parse({
        issuer: getIssuer(ctx.env, customDomain),
        authorization_endpoint: `${getAuthUrl(ctx.env, customDomain)}authorize`,
        token_endpoint: `${getAuthUrl(ctx.env, customDomain)}oauth/token`,
        device_authorization_endpoint: `${getAuthUrl(ctx.env, customDomain)}oauth/device/code`,
        userinfo_endpoint: `${getAuthUrl(ctx.env, customDomain)}userinfo`,
        mfa_challenge_endpoint: `${getAuthUrl(ctx.env, customDomain)}mfa/challenge`,
        jwks_uri: `${getAuthUrl(ctx.env, customDomain)}.well-known/jwks.json`,
        registration_endpoint: `${getAuthUrl(ctx.env, customDomain)}oidc/register`,
        revocation_endpoint: `${getAuthUrl(ctx.env, customDomain)}oauth/revoke`,
        scopes_supported: [
          "openid",
          "profile",
          "offline_access",
          "name",
          "given_name",
          "family_name",
          "nickname",
          "email",
          "email_verified",
          "picture",
          "created_at",
          "identities",
          "phone",
          "address",
        ],
        response_types_supported: [
          "code",
          "token",
          "id_token",
          "code token",
          "code id_token",
          "token id_token",
          "code token id_token",
        ],
        code_challenge_methods_supported: ["S256", "plain"],
        response_modes_supported: ["query", "fragment", "form_post"],
        subject_types_supported: ["public"],
        // Currently only support RS256 and not HS256
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: [
          "client_secret_basic",
          "client_secret_post",
          // private_key_jwt is not supported yet
          // "private_key_jwt",
        ],
        claims_supported: [
          "aud",
          "auth_time",
          "created_at",
          "email",
          "email_verified",
          "exp",
          "family_name",
          "given_name",
          "iat",
          "identities",
          "iss",
          "name",
          "nickname",
          "phone_number",
          "picture",
          "sub",
        ],
        request_uri_parameter_supported: false,
        request_parameter_supported: false,
        token_endpoint_auth_signing_alg_values_supported: [
          "RS256",
          "RS384",
          "PS256",
        ],
      });

      return ctx.json(result, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-method": "GET",
          "cache-control": `public, max-age=${JWKS_CACHE_TIMEOUT_IN_SECONDS}, stale-while-revalidate=${JWKS_CACHE_TIMEOUT_IN_SECONDS * 2
            }, stale-if-error=86400`,
        },
      });
    },
  )
  // --------------------------------
  // GET /.well-known/* (HTTP domain validation)
  // --------------------------------
  .get("/*", async (ctx) => {
    const domain = ctx.var.custom_domain || ctx.req.header("x-forwarded-host");
    if (!domain) return ctx.text("Not Found", 404);

    const customDomain = await ctx.env.data.customDomains.getByDomain(domain);
    if (!customDomain) return ctx.text("Not Found", 404);

    const fullDomain = await ctx.env.data.customDomains.get(
      customDomain.tenant_id,
      customDomain.custom_domain_id,
    );
    if (!fullDomain?.verification?.methods) return ctx.text("Not Found", 404);

    const requestPath = new URL(ctx.req.url).pathname;
    const httpMethod = fullDomain.verification.methods.find(
      (m) => m.name === "http" && new URL(m.http_url).pathname === requestPath,
    );

    if (!httpMethod || httpMethod.name !== "http") {
      return ctx.text("Not Found", 404);
    }

    return ctx.text(httpMethod.http_body, 200, {
      "content-type": "text/plain",
    });
  });
