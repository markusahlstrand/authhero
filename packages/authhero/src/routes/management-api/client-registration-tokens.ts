import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { LogTypes } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { logMessage } from "../../helpers/logging";
import { mintIat } from "../../helpers/dcr/mint-iat";
import { requireClientRegistrationTokens } from "../auth-api/register/shared";

const mintBodySchema = z.object({
  sub: z.string().optional().openapi({
    description: "User ID to bind the IAT to (optional)",
  }),
  constraints: z.record(z.unknown()).optional().openapi({
    description:
      "Pre-bound metadata that the registration request must match exactly (or omit, in which case the value is filled in from this map)",
  }),
  expires_in_seconds: z
    .number()
    .int()
    .min(30)
    .max(60 * 60 * 24)
    .optional()
    .openapi({
      description: "Token TTL in seconds. Default 300 (5 minutes).",
    }),
  single_use: z.boolean().optional().openapi({
    description:
      "Whether the IAT is invalidated after first use. Default true.",
  }),
});

const mintResponseSchema = z.object({
  id: z.string(),
  token: z.string(),
  expires_at: z.string(),
  sub: z.string().optional(),
  constraints: z.record(z.unknown()).optional(),
  single_use: z.boolean(),
});

export const clientRegistrationTokenRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapi(
  createRoute({
    tags: ["client-registration-tokens"],
    method: "post",
    path: "/",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      body: {
        content: {
          "application/json": { schema: mintBodySchema },
        },
      },
    },
    security: [
      {
        Bearer: ["create:client_registration_tokens", "auth:write"],
      },
    ],
    responses: {
      201: {
        content: { "application/json": { schema: mintResponseSchema } },
        description:
          "Initial Access Token issued. The `token` field is shown once and not retrievable later.",
      },
    },
  }),
  async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    const body = ctx.req.valid("json");

    const minted = await mintIat(
      requireClientRegistrationTokens(ctx.env.data),
      tenant_id,
      {
        sub: body.sub,
        constraints: body.constraints,
        expires_in_seconds: body.expires_in_seconds,
        single_use: body.single_use,
      },
    );

    await logMessage(ctx, tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "DCR Initial Access Token issued via Management API",
      targetType: "client_registration_token",
      targetId: minted.id,
      userId: body.sub,
    });

    return ctx.json(
      {
        id: minted.id,
        token: minted.token,
        expires_at: minted.expires_at,
        sub: minted.record.sub,
        constraints: minted.record.constraints,
        single_use: minted.record.single_use,
      },
      201,
    );
  },
);
