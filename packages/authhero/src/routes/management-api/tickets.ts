/**
 * Auth0-compatible /api/v2/tickets endpoints.
 *
 * - POST /api/v2/tickets/email-verification — issue a single-use URL that
 *   marks the targeted user's email as verified when followed.
 * - POST /api/v2/tickets/password-change — issue a single-use URL that lets
 *   the targeted user set a new password.
 *
 * Tickets are persisted in the `codes` table with `code_type: "ticket"` and
 * the URL points at /u2/tickets/<type>?ticket=<code_id>, where a follower
 * route consumes the code, performs the action, then redirects to either the
 * caller-supplied `result_url` or the screen for password set.
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { LogTypes } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { logMessage } from "../../helpers/logging";
import { getIssuer } from "../../variables";

import { defineRoute } from "../../utils/define-route";
import { requireTenantId } from "./helpers";
const DEFAULT_TTL_SEC = 432000; // 5 days, matches Auth0 default

const emailVerificationTicketBodySchema = z.object({
  user_id: z.string(),
  result_url: z.string().url().optional(),
  ttl_sec: z.number().int().positive().max(2592000).optional(),
  client_id: z.string().optional(),
  organization_id: z.string().optional(),
  identity: z
    .object({
      user_id: z.string().optional(),
      provider: z.string().optional(),
    })
    .optional(),
  includeEmailInRedirect: z.boolean().optional(),
});

const passwordChangeTicketBodySchema = z.object({
  user_id: z.string().optional(),
  email: z.string().email().optional(),
  connection_id: z.string().optional(),
  result_url: z.string().url().optional(),
  ttl_sec: z.number().int().positive().max(2592000).optional(),
  client_id: z.string().optional(),
  organization_id: z.string().optional(),
  mark_email_as_verified: z.boolean().optional(),
  includeEmailInRedirect: z.boolean().optional(),
  new_password: z.string().optional(),
});

const ticketResponseSchema = z.object({
  ticket: z.string().openapi({
    description: "A URL representing the ticket. Single-use, time-limited.",
  }),
});
const postEmailVerification = defineRoute({
  route: createRoute({
    tags: ["tickets"],
    method: "post",
    path: "/email-verification",
    request: {
      headers: z.object({ "tenant-id": z.string().optional() }),
      body: {
        content: {
          "application/json": {
            schema: emailVerificationTicketBodySchema,
          },
        },
      },
    },
    security: [{ Bearer: ["create:user_tickets"] }],
    responses: {
      201: {
        description: "Email verification ticket created",
        content: {
          "application/json": { schema: ticketResponseSchema },
        },
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const body = ctx.req.valid("json");

    const user = await ctx.env.data.users.get(tenantId, body.user_id);
    if (!user) {
      throw new HTTPException(404, { message: "User not found" });
    }

    const ticketId = nanoid();
    const ttl = body.ttl_sec ?? DEFAULT_TTL_SEC;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    await ctx.env.data.codes.create(tenantId, {
      code_id: ticketId,
      code_type: "ticket",
      login_id: ticketId,
      user_id: user.user_id,
      expires_at: expiresAt,
      redirect_uri: body.result_url,
      state: JSON.stringify({
        purpose: "email_verification",
        client_id: body.client_id,
        organization_id: body.organization_id,
        result_url: body.result_url,
        includeEmailInRedirect: body.includeEmailInRedirect,
      }),
    });

    const issuer = getIssuer(ctx.env, ctx.var.custom_domain);
    const url = new URL("u2/tickets/email-verification", issuer);
    url.searchParams.set("ticket", ticketId);
    if (!ctx.var.custom_domain) {
      url.searchParams.set("tenant_id", tenantId);
    }

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Create Email Verification Ticket",
      targetType: "ticket",
      targetId: ticketId,
      userId: user.user_id,
    });

    return ctx.json({ ticket: url.toString() }, { status: 201 });
  },
});

const postPasswordChange = defineRoute({
  route: createRoute({
    tags: ["tickets"],
    method: "post",
    path: "/password-change",
    request: {
      headers: z.object({ "tenant-id": z.string().optional() }),
      body: {
        content: {
          "application/json": {
            schema: passwordChangeTicketBodySchema,
          },
        },
      },
    },
    security: [{ Bearer: ["create:user_tickets"] }],
    responses: {
      201: {
        description: "Password change ticket created",
        content: {
          "application/json": { schema: ticketResponseSchema },
        },
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const body = ctx.req.valid("json");

    // Resolve user from user_id, or email + connection_id (Auth0 alternative).
    let userId = body.user_id;
    if (!userId) {
      if (!body.email) {
        throw new HTTPException(400, {
          message: "user_id or email is required",
        });
      }
      let connectionName: string | undefined;
      if (body.connection_id) {
        const connection = await ctx.env.data.connections.get(
          tenantId,
          body.connection_id,
        );
        if (!connection) {
          throw new HTTPException(404, {
            message: `Connection not found (connection_id=${body.connection_id})`,
          });
        }
        connectionName = connection.name;
      }
      const q = connectionName
        ? `email:${body.email.toLowerCase()} connection:${connectionName}`
        : `email:${body.email.toLowerCase()}`;
      const { users } = await ctx.env.data.users.list(tenantId, {
        q,
        per_page: 1,
      });
      const user = users[0];
      if (!user) {
        throw new HTTPException(404, { message: "User not found" });
      }
      userId = user.user_id;
    }

    const ticketId = nanoid();
    const ttl = body.ttl_sec ?? DEFAULT_TTL_SEC;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    await ctx.env.data.codes.create(tenantId, {
      code_id: ticketId,
      code_type: "ticket",
      login_id: ticketId,
      user_id: userId,
      expires_at: expiresAt,
      redirect_uri: body.result_url,
      state: JSON.stringify({
        purpose: "password_change",
        client_id: body.client_id,
        organization_id: body.organization_id,
        connection_id: body.connection_id,
        result_url: body.result_url,
        mark_email_as_verified: body.mark_email_as_verified,
      }),
    });

    const issuer = getIssuer(ctx.env, ctx.var.custom_domain);
    const url = new URL("u2/tickets/password-change", issuer);
    url.searchParams.set("ticket", ticketId);
    if (!ctx.var.custom_domain) {
      url.searchParams.set("tenant_id", tenantId);
    }

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Create Password Change Ticket",
      targetType: "ticket",
      targetId: ticketId,
      userId,
    });

    return ctx.json({ ticket: url.toString() }, { status: 201 });
  },
});

export const ticketsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([postEmailVerification, postPasswordChange] as const);
