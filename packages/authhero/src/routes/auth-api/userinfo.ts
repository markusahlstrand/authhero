import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { JSONHTTPException } from "../../errors/json-http-exception";
import { validateJwtToken, JwtPayload } from "../../utils/jwt";
import {
  buildScopeClaims,
  buildRequestedClaims,
} from "../../helpers/scope-claims";
import type { User } from "@authhero/adapter-interfaces";

import { defineRoute } from "../../utils/define-route";
import { getIssuer } from "../../variables";
import { withDefaultPicture } from "../../helpers/avatar";
// OIDC Address Claim schema per OIDC Core 5.1.1
const addressClaimSchema = z
  .object({
    formatted: z.string().optional(),
    street_address: z.string().optional(),
    locality: z.string().optional(),
    region: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().optional(),
  })
  .optional();

const userInfoSchema = z.object({
  sub: z.string(),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  // Phone scope claims (OIDC Core 5.4)
  phone_number: z.string().optional(),
  phone_number_verified: z.boolean().optional(),
  // Profile scope claims (OIDC Core 5.4)
  name: z.string().optional(),
  family_name: z.string().optional(),
  given_name: z.string().optional(),
  middle_name: z.string().optional(),
  nickname: z.string().optional(),
  preferred_username: z.string().optional(),
  profile: z.string().optional(),
  picture: z.string().optional(),
  website: z.string().optional(),
  gender: z.string().optional(),
  birthdate: z.string().optional(),
  zoneinfo: z.string().optional(),
  locale: z.string().optional(),
  updated_at: z.number().optional(),
  // Address scope claim (OIDC Core 5.4)
  address: addressClaimSchema,
});

type UserInfoResponse = z.infer<typeof userInfoSchema>;

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

// OIDC Core 5.5 — pull the list of requested userinfo claim names off the
// access token payload. The mint stamps `requested_userinfo_claims` as an
// array of strings; defensive guards keep this honest against tokens
// minted by older code paths or hand-crafted in tests.
function extractRequestedUserinfoClaims(tokenPayload: unknown): string[] {
  if (!isObject(tokenPayload)) return [];
  const raw = tokenPayload.requested_userinfo_claims;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

function buildUserInfoResponse(
  user: User,
  scopes: string[],
  requestedClaims: string[] = [],
  issuer?: string,
) {
  // sub is the only claim always included (OIDC Core 5.3.2). Scope-driven
  // claims are shared with the ID Token via buildScopeClaims. Individually
  // requested claims (OIDC Core 5.5 `claims.userinfo`) are merged on top,
  // regardless of scope.
  //
  // The generated-avatar fallback is a convenience for the `profile` scope,
  // where consumers expect `picture` to always be present. It must NOT leak
  // into responses that didn't grant `profile` — in particular an
  // individually requested `picture` claim must reflect the user's real
  // value, so buildRequestedClaims always sees the un-enriched user.
  const scopedUser =
    issuer && scopes.includes("profile")
      ? withDefaultPicture(user, issuer)
      : user;
  return {
    sub: user.user_id,
    ...buildScopeClaims(scopedUser, scopes),
    ...buildRequestedClaims(user, requestedClaims),
  };
}

const postBodySchema = z.object({
  access_token: z.string().optional(),
});
const getRoot = defineRoute({
  route: createRoute({
    tags: ["oauth2"],
    method: "get",
    path: "/",
    request: {},
    security: [
      {
        Bearer: ["openid"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: userInfoSchema,
          },
        },
        description: "Userinfo",
      },
    },
  }),
  handler: async (ctx) => {
    if (!ctx.var.user) {
      throw new HTTPException(404, { message: "User not found" });
    }

    // Get tenant_id from token or fallback to context (from tenant middleware)
    const tenant_id = ctx.var.user.tenant_id || ctx.var.tenant_id;
    if (!tenant_id) {
      throw new HTTPException(400, { message: "Unable to determine tenant" });
    }

    // RFC 6749 §4.1.2: tokens issued from a reused authorization code must
    // be revoked. Access tokens are stateless JWTs, so we enforce
    // revocation here by looking up the session referenced by the token's
    // `sid` claim and rejecting if it's been marked revoked.
    const sid = (ctx.var.user as { sid?: unknown }).sid;
    if (typeof sid === "string" && sid.length > 0) {
      const session = await ctx.env.data.sessions.get(tenant_id, sid);
      if (session?.revoked_at) {
        throw new HTTPException(401, {
          message: "Session has been revoked",
        });
      }
    }

    const storedUser = await ctx.env.data.users.get(
      tenant_id,
      ctx.var.user.sub,
    );

    if (!storedUser) {
      throw new HTTPException(404, { message: "User not found" });
    }

    const issuer = getIssuer(ctx.env, ctx.var.custom_domain);
    // The hook context has historically always seen a `picture`; keep a
    // default-picture-enriched copy for it. The response itself only attaches
    // the fallback on the `profile`-scoped path (see buildUserInfoResponse).
    const user = withDefaultPicture(storedUser, issuer);

    // Get scope from token payload (ctx.var.user contains full JWT payload)
    const tokenPayload = ctx.var.user;
    const scopes = tokenPayload?.scope?.split(" ") || [];
    const requestedClaims = extractRequestedUserinfoClaims(tokenPayload);

    // Build initial userinfo response based on scopes + requested claims
    const baseUserInfo = buildUserInfoResponse(
      storedUser,
      scopes,
      requestedClaims,
      issuer,
    );

    // Call onFetchUserInfo hook if configured
    const onFetchUserInfo = ctx.env.hooks?.onFetchUserInfo;
    if (onFetchUserInfo) {
      const customClaims: Record<string, unknown> = {};

      await onFetchUserInfo(
        {
          ctx,
          user,
          tenant_id,
          scopes,
        },
        {
          setCustomClaim: (claim: string, value: unknown) => {
            customClaims[claim] = value;
          },
        },
      );

      // Merge custom claims into userinfo (custom claims override base)
      return ctx.json({
        ...baseUserInfo,
        ...customClaims,
      } as UserInfoResponse);
    }

    return ctx.json(baseUserInfo as UserInfoResponse);
  },
});

const postRoot = defineRoute({
  route: createRoute({
    tags: ["oauth2"],
    method: "post",
    path: "/",
    request: {
      body: {
        content: {
          "application/x-www-form-urlencoded": {
            schema: postBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: userInfoSchema,
          },
        },
        description: "Userinfo",
      },
    },
  }),
  handler: async (ctx) => {
    let tokenPayload: JwtPayload | null = null;

    // Step 1: Check if auth middleware already set the user (from Authorization header with security defined)
    if (ctx.var.user) {
      tokenPayload = ctx.var.user as JwtPayload;
    }

    // Step 2: If not, manually check Authorization header
    if (!tokenPayload) {
      const authHeader = ctx.req.header("authorization") || "";
      const [authType, bearer] = authHeader.split(" ");

      if (authType?.toLowerCase() === "bearer" && bearer) {
        tokenPayload = await validateJwtToken(ctx, bearer);

        // Check for openid scope
        const scopes = tokenPayload?.scope?.split(" ") || [];
        if (!scopes.includes("openid")) {
          throw new JSONHTTPException(403, {
            message: "openid scope required",
          });
        }

        ctx.set("user", tokenPayload as Variables["user"]);
      }
    }

    // Step 3: If still no token, check POST body for access_token (optional per OIDC spec)
    if (!tokenPayload) {
      try {
        // Use parseBody() which works with form data
        const body = await ctx.req.parseBody();
        const accessToken =
          typeof body.access_token === "string" ? body.access_token : undefined;

        if (accessToken) {
          tokenPayload = await validateJwtToken(ctx, accessToken);

          // Check for openid scope
          const scopes = tokenPayload?.scope?.split(" ") || [];
          if (!scopes.includes("openid")) {
            throw new JSONHTTPException(403, {
              message: "openid scope required",
            });
          }

          ctx.set("user", tokenPayload as Variables["user"]);
        }
      } catch (error) {
        // If body parsing fails or token validation fails, we'll handle it below
        if (
          error instanceof HTTPException ||
          error instanceof JSONHTTPException
        ) {
          throw error;
        }
        // Otherwise, token is just not in body, which is fine
      }
    }

    // Step 4: At this point, if we still don't have a token, return 401
    if (!tokenPayload) {
      throw new HTTPException(401, { message: "No access token provided" });
    }

    // Get tenant_id from token or fallback to context (from tenant middleware)
    const tenant_id = tokenPayload.tenant_id || ctx.var.tenant_id;
    if (!tenant_id) {
      throw new HTTPException(400, { message: "Unable to determine tenant" });
    }

    // RFC 6749 §4.1.2: tokens issued from a reused authorization code must
    // be revoked. Access tokens are stateless JWTs, so we enforce
    // revocation here by looking up the session referenced by the token's
    // `sid` claim and rejecting if it's been marked revoked.
    const sidPost = (tokenPayload as { sid?: unknown }).sid;
    if (typeof sidPost === "string" && sidPost.length > 0) {
      const session = await ctx.env.data.sessions.get(tenant_id, sidPost);
      if (session?.revoked_at) {
        throw new HTTPException(401, {
          message: "Session has been revoked",
        });
      }
    }

    const storedUser = await ctx.env.data.users.get(
      tenant_id,
      tokenPayload.sub,
    );

    if (!storedUser) {
      throw new HTTPException(404, { message: "User not found" });
    }

    const issuer = getIssuer(ctx.env, ctx.var.custom_domain);
    // The hook context has historically always seen a `picture`; keep a
    // default-picture-enriched copy for it. The response itself only attaches
    // the fallback on the `profile`-scoped path (see buildUserInfoResponse).
    const user = withDefaultPicture(storedUser, issuer);

    // Get scopes from the token
    const scopes = tokenPayload?.scope?.split(" ") || [];
    const requestedClaims = extractRequestedUserinfoClaims(tokenPayload);

    // Build initial userinfo response based on scopes + requested claims
    const baseUserInfo = buildUserInfoResponse(
      storedUser,
      scopes,
      requestedClaims,
      issuer,
    );

    // Call onFetchUserInfo hook if configured
    const onFetchUserInfo = ctx.env.hooks?.onFetchUserInfo;
    if (onFetchUserInfo) {
      const customClaims: Record<string, unknown> = {};

      await onFetchUserInfo(
        {
          ctx,
          user,
          tenant_id,
          scopes,
        },
        {
          setCustomClaim: (claim: string, value: unknown) => {
            customClaims[claim] = value;
          },
        },
      );

      // Merge custom claims into userinfo (custom claims override base)
      return ctx.json({
        ...baseUserInfo,
        ...customClaims,
      } as UserInfoResponse);
    }

    return ctx.json(baseUserInfo as UserInfoResponse);
  },
});

export const userinfoRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getRoot, postRoot] as const);
