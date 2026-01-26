import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { JSONHTTPException } from "../../errors/json-http-exception";
import { validateJwtToken, JwtPayload } from "../../utils/jwt";
import type { User } from "@authhero/adapter-interfaces";

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

/**
 * Builds the userinfo response based on the requested scopes per OIDC spec.
 * @param user The user object from the database
 * @param scopes Array of scope strings from the access token
 * @returns Filtered userinfo object containing only claims for requested scopes
 */
function buildUserInfoResponse(user: User, scopes: string[]) {
  // sub is the only claim always included (OIDC Core 5.3.2)
  const userInfo: Record<string, unknown> = {
    sub: user.user_id,
  };

  // Add email claims if email scope is present (OIDC Core 5.4)
  if (scopes.includes("email")) {
    if (user.email) {
      userInfo.email = user.email;
    }
    // email_verified should only be returned with email scope
    if (user.email_verified !== undefined) {
      userInfo.email_verified = user.email_verified;
    }
  }

  // Add profile claims if profile scope is present
  // Per OIDC spec, only include claims with actual values (omit null/undefined/empty)
  if (scopes.includes("profile")) {
    if (user.name) userInfo.name = user.name;
    if (user.family_name) userInfo.family_name = user.family_name;
    if (user.given_name) userInfo.given_name = user.given_name;
    if (user.middle_name) userInfo.middle_name = user.middle_name;
    if (user.nickname) userInfo.nickname = user.nickname;
    // preferred_username falls back to username if not set
    const preferredUsername = user.preferred_username || user.username;
    if (preferredUsername) userInfo.preferred_username = preferredUsername;
    if (user.profile) userInfo.profile = user.profile;
    if (user.picture) userInfo.picture = user.picture;
    if (user.website) userInfo.website = user.website;
    if (user.gender) userInfo.gender = user.gender;
    if (user.birthdate) userInfo.birthdate = user.birthdate;
    if (user.zoneinfo) userInfo.zoneinfo = user.zoneinfo;
    if (user.locale) userInfo.locale = user.locale;
    if (user.updated_at) {
      userInfo.updated_at = Math.floor(
        new Date(user.updated_at).getTime() / 1000,
      );
    }
  }

  // Add address claim if address scope is present (OIDC Core 5.4)
  if (scopes.includes("address")) {
    if (user.address) {
      userInfo.address = user.address;
    }
  }

  // Add phone claims if phone scope is present (OIDC Core 5.4)
  if (scopes.includes("phone")) {
    if (user.phone_number) {
      userInfo.phone_number = user.phone_number;
    }
    // phone_number_verified is the OIDC standard claim name (OIDC Core 5.4)
    // We store it as phone_verified internally
    if (user.phone_verified !== undefined) {
      userInfo.phone_number_verified = user.phone_verified;
    }
  }

  return userInfo;
}

const postBodySchema = z.object({
  access_token: z.string().optional(),
});

export const userinfoRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /userinfo
  // --------------------------------
  .openapi(
    createRoute({
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
    async (ctx) => {
      if (!ctx.var.user) {
        throw new HTTPException(404, { message: "User not found" });
      }

      // Get tenant_id from token or fallback to context (from tenant middleware)
      const tenant_id = ctx.var.user.tenant_id || ctx.var.tenant_id;
      if (!tenant_id) {
        throw new HTTPException(400, { message: "Unable to determine tenant" });
      }

      const user = await ctx.env.data.users.get(tenant_id, ctx.var.user.sub);

      if (!user) {
        throw new HTTPException(404, { message: "User not found" });
      }

      // Get scope from token payload (ctx.var.user contains full JWT payload)
      const tokenPayload = ctx.var.user;
      const scopes = tokenPayload?.scope?.split(" ") || [];

      // Build initial userinfo response based on scopes
      const baseUserInfo = buildUserInfoResponse(user, scopes);

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
  )
  // --------------------------------
  // POST /userinfo
  // --------------------------------
  .openapi(
    createRoute({
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
    async (ctx) => {
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
            typeof body.access_token === "string"
              ? body.access_token
              : undefined;

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

      const user = await ctx.env.data.users.get(tenant_id, tokenPayload.sub);

      if (!user) {
        throw new HTTPException(404, { message: "User not found" });
      }

      // Get scopes from the token
      const scopes = tokenPayload?.scope?.split(" ") || [];

      // Build initial userinfo response based on scopes
      const baseUserInfo = buildUserInfoResponse(user, scopes);

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
  );
