import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { querySchema } from "../../types/auth0/Query";
import { auditEventSchema } from "@authhero/adapter-interfaces";

const outboxEventSchema = auditEventSchema.extend({
  created_at: z.string(),
  processed_at: z.string().nullable(),
  retry_count: z.number(),
  next_retry_at: z.string().nullable(),
  error: z.string().nullable(),
  dead_lettered_at: z.string().nullable().optional(),
  final_error: z.string().nullable().optional(),
});

const listFailedEventsResponseSchema = z.object({
  events: z.array(outboxEventSchema),
  start: z.number(),
  limit: z.number(),
  length: z.number(),
});

export const failedEventsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /failed-events
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["failed-events"],
      method: "get",
      path: "/",
      request: {
        query: querySchema,
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["read:logs", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: listFailedEventsResponseSchema,
            },
          },
          description: "Dead-lettered outbox events",
        },
      },
    }),
    async (ctx) => {
      const outbox = ctx.env.data.outbox;
      if (!outbox) {
        throw new HTTPException(501, {
          message: "Outbox is not configured for this adapter",
        });
      }

      const { page, per_page, include_totals } = ctx.req.valid("query");
      const result = await outbox.listFailed(ctx.var.tenant_id, {
        page,
        per_page,
        include_totals,
      });

      return ctx.json({
        events: result.events,
        start: result.start,
        limit: result.limit,
        length: result.length,
      });
    },
  )
  // --------------------------------
  // POST /failed-events/:id/retry
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["failed-events"],
      method: "post",
      path: "/{id}/retry",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
        params: z.object({ id: z.string() }),
      },
      security: [
        {
          Bearer: ["update:logs", "auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.object({ id: z.string(), replayed: z.boolean() }),
            },
          },
          description: "Event queued for retry",
        },
        404: { description: "Not found" },
      },
    }),
    async (ctx) => {
      const outbox = ctx.env.data.outbox;
      if (!outbox) {
        throw new HTTPException(501, {
          message: "Outbox is not configured for this adapter",
        });
      }

      const { id } = ctx.req.valid("param");
      // Scope replay to the caller's tenant so a management-API token issued
      // for tenant A can never reach into tenant B's dead-letter queue.
      const replayed = await outbox.replay(id, ctx.var.tenant_id);
      if (!replayed) {
        throw new HTTPException(404, {
          message: "Dead-lettered event not found",
        });
      }
      return ctx.json({ id, replayed: true });
    },
  );
