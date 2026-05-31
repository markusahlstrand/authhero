import {
  jwksKeySchema,
  openIDConfigurationSchema,
} from "@authhero/adapter-interfaces";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { JWKS_CACHE_TIMEOUT_IN_SECONDS } from "../../constants";
import { Bindings, Variables } from "../../types";
import { getAuthUrl, getIssuer } from "../../variables";
import { getJwksForPublication } from "../../utils/jwks";
import { SUPPORTED_ID_TOKEN_SIGNING_ALGS } from "../../utils/jwk-alg";
import { defineRoute } from "../../utils/define-route";
const getJwksJson = defineRoute({
  route: createRoute({
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
  handler: async (ctx) => {
    const keys = await getJwksForPublication(
      ctx.env.data,
      ctx.var.tenant_id,
      ctx.env.signingKeyMode,
    );

    return ctx.json(
      { keys },
      {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-method": "GET",
          "cache-control": `public, max-age=${JWKS_CACHE_TIMEOUT_IN_SECONDS}, stale-while-revalidate=${
            JWKS_CACHE_TIMEOUT_IN_SECONDS * 2
          }, stale-if-error=86400`,
        },
      },
    );
  },
});

const METADATA_CACHE_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-method": "GET",
  "cache-control": `public, max-age=${JWKS_CACHE_TIMEOUT_IN_SECONDS}, stale-while-revalidate=${
    JWKS_CACHE_TIMEOUT_IN_SECONDS * 2
  }, stale-if-error=86400`,
};

async function buildAuthServerMetadata(ctx: {
  var: { custom_domain?: string; tenant_id: string };
  env: Bindings;
}) {
  const customDomain = ctx.var.custom_domain;
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
  const dcrEnabled = tenant?.flags?.enable_dynamic_client_registration === true;
  const cimdEnabled =
    tenant?.flags?.client_id_metadata_document_registration === true;
  // OIDC RP-Initiated Logout 1.0 expects compliant OPs to advertise the
  // end_session_endpoint via discovery. The flag is treated as opt-*out*
  // (only `=== false` hides the endpoint) so that a tenant can fall back
  // to the legacy /v2/logout-only behaviour explicitly if they need to.
  const endSessionEndpointDiscovery =
    tenant?.oidc_logout?.rp_logout_end_session_endpoint_discovery !== false;
  const result = openIDConfigurationSchema.parse({
    issuer: getIssuer(ctx.env, customDomain),
    authorization_endpoint: `${getAuthUrl(ctx.env, customDomain)}authorize`,
    token_endpoint: `${getAuthUrl(ctx.env, customDomain)}oauth/token`,
    userinfo_endpoint: `${getAuthUrl(ctx.env, customDomain)}userinfo`,
    jwks_uri: `${getAuthUrl(ctx.env, customDomain)}.well-known/jwks.json`,
    ...(dcrEnabled
      ? {
          registration_endpoint: `${getAuthUrl(ctx.env, customDomain)}oidc/register`,
        }
      : {}),
    revocation_endpoint: `${getAuthUrl(ctx.env, customDomain)}oauth/revoke`,
    ...(endSessionEndpointDiscovery
      ? {
          end_session_endpoint: `${getAuthUrl(ctx.env, customDomain)}oidc/logout`,
        }
      : {}),
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
      "id_token token",
      "code id_token",
      "code token",
      "code id_token token",
    ],
    grant_types_supported: [
      "authorization_code",
      "client_credentials",
      "refresh_token",
      "implicit",
      "http://auth0.com/oauth/grant-type/passwordless/otp",
    ],
    code_challenge_methods_supported: ["S256", "plain"],
    response_modes_supported: ["query", "fragment", "form_post"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: SUPPORTED_ID_TOKEN_SIGNING_ALGS,
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_basic",
      "client_secret_post",
      "client_secret_jwt",
      "private_key_jwt",
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
    request_uri_parameter_supported: true,
    request_parameter_supported: true,
    // OIDC Core 5.5 — we honor the `claims` request parameter for
    // standard claims listed in `claims_supported` (individual claim
    // requests for /userinfo and the ID Token).
    claims_parameter_supported: true,
    request_object_signing_alg_values_supported: [
      "RS256",
      "RS384",
      "RS512",
      "ES256",
      "ES384",
      "ES512",
      "HS256",
      "HS384",
      "HS512",
    ],
    token_endpoint_auth_signing_alg_values_supported: [
      "RS256",
      "RS384",
      "RS512",
      "ES256",
      "ES384",
      "ES512",
      "HS256",
      "HS384",
      "HS512",
    ],
    client_id_metadata_document_supported: cimdEnabled,
  });

  return result;
}

const getOpenidConfiguration = defineRoute({
  route: createRoute({
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
        description: "OpenID Provider configuration",
      },
    },
  }),
  handler: async (ctx) => {
    const result = await buildAuthServerMetadata(ctx);
    return ctx.json(result, { headers: METADATA_CACHE_HEADERS });
  },
});

// RFC 8414 OAuth 2.0 Authorization Server Metadata. Returns the same body as
// the OpenID configuration; MCP clients discover capabilities (including CIMD)
// here rather than at /.well-known/openid-configuration.
const getOAuthAuthorizationServer = defineRoute({
  route: createRoute({
    tags: ["well known"],
    method: "get",
    path: "/oauth-authorization-server",
    request: {},
    responses: {
      200: {
        content: {
          "application/json": {
            schema: openIDConfigurationSchema,
          },
        },
        description: "OAuth 2.0 Authorization Server Metadata (RFC 8414)",
      },
    },
  }),
  handler: async (ctx) => {
    const result = await buildAuthServerMetadata(ctx);
    return ctx.json(result, { headers: METADATA_CACHE_HEADERS });
  },
});

export const wellKnownRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  .openapiRoutes([
    getJwksJson,
    getOpenidConfiguration,
    getOAuthAuthorizationServer,
  ] as const)
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
