import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { querySchema } from "../../types/auth0/Query";
import { auditEventSchema } from "@authhero/adapter-interfaces";

import { defineRoute } from "../../utils/define-route";
import { requireTenantId } from "./helpers";
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

/**
 * Upper bound on a single bulk-retry call. Each id is a separate adapter
 * round-trip, so an unbounded list would let one request hold a worker for
 * an arbitrary time. Operators with a larger backlog page through it.
 */
const BULK_RETRY_MAX_IDS = 100;

const bulkRetryResponseSchema = z.object({
  replayed: z.array(z.string()),
  not_found: z.array(z.string()),
});
const getRoot = defineRoute({
  route: createRoute({
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
        Bearer: ["read:logs"],
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
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const outbox = ctx.env.data.outbox;
    if (!outbox) {
      throw new HTTPException(501, {
        message: "Outbox is not configured for this adapter",
      });
    }

    const { page, per_page, include_totals } = ctx.req.valid("query");
    const result = await outbox.listFailed(tenantId, {
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
});

const postByIdRetry = defineRoute({
  route: createRoute({
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
        Bearer: ["update:logs"],
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
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const outbox = ctx.env.data.outbox;
    if (!outbox) {
      throw new HTTPException(501, {
        message: "Outbox is not configured for this adapter",
      });
    }

    const { id } = ctx.req.valid("param");
    // Scope replay to the caller's tenant so a management-API token issued
    // for tenant A can never reach into tenant B's dead-letter queue.
    const replayed = await outbox.replay(id, tenantId);
    if (!replayed) {
      throw new HTTPException(404, {
        message: "Dead-lettered event not found",
      });
    }
    return ctx.json({ id, replayed: true });
  },
});

const postBulkRetry = defineRoute({
  route: createRoute({
    tags: ["failed-events"],
    method: "post",
    path: "/bulk-retry",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              ids: z.array(z.string()).min(1).max(BULK_RETRY_MAX_IDS),
            }),
          },
        },
      },
    },
    security: [
      {
        Bearer: ["update:logs"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: bulkRetryResponseSchema,
          },
        },
        description: "Per-id replay result",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const outbox = ctx.env.data.outbox;
    if (!outbox) {
      throw new HTTPException(501, {
        message: "Outbox is not configured for this adapter",
      });
    }

    const { ids } = ctx.req.valid("json");

    const replayed: string[] = [];
    const notFound: string[] = [];
    // A repeated id would replay once and then miss (the row is no longer
    // dead-lettered), landing the same id in both buckets. Dedupe first so
    // each id gets exactly one verdict, in the order it was sent.
    for (const id of new Set(ids)) {
      // Same tenant scoping as the single-event retry: a token for tenant A
      // can never reach into tenant B's dead-letter queue. One unknown id
      // reports as not_found rather than failing the whole batch.
      const wasReplayed = await outbox.replay(id, tenantId);
      (wasReplayed ? replayed : notFound).push(id);
    }

    return ctx.json({ replayed, not_found: notFound });
  },
});

export const failedEventsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getRoot, postBulkRetry, postByIdRetry] as const);
