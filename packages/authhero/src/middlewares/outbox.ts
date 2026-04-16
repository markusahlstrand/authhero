import { Context, MiddlewareHandler } from "hono";
import { OutboxAdapter } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { waitUntil, flushBackgroundPromises } from "../helpers/wait-until";
import { processOutboxEvents, EventDestination } from "../helpers/outbox-relay";

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

export interface OutboxMiddlewareOptions {
  /**
   * Resolve the OutboxAdapter for this request.
   * Return undefined to skip outbox processing.
   */
  getOutbox: (ctx: Ctx) => OutboxAdapter | undefined;

  /**
   * Build the list of destinations for delivering outbox events.
   */
  getDestinations: (ctx: Ctx) => EventDestination[];
}

export function outboxMiddleware(
  options: OutboxMiddlewareOptions,
): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> {
  return async (ctx, next) => {
    ctx.set("outboxEventPromises", []);
    ctx.set("backgroundPromises", []);
    let error: unknown;
    try {
      await next();
    } catch (e) {
      error = e;
    } finally {
      const eventPromises = ctx.var.outboxEventPromises ?? [];
      let eventIds: string[] = [];
      if (eventPromises.length > 0) {
        const settled = await Promise.allSettled(eventPromises);
        for (const result of settled) {
          if (result.status === "fulfilled") {
            eventIds.push(result.value);
          } else {
            console.error("Outbox event creation failed", result.reason);
          }
        }
      }
      if (eventIds.length > 0) {
        const outbox = options.getOutbox(ctx);
        if (outbox) {
          waitUntil(
            ctx,
            processOutboxEvents(
              outbox,
              eventIds,
              options.getDestinations(ctx),
              {
                maxRetries: ctx.env.outbox?.maxRetries,
              },
            ),
          );
        }
      }
      // Drain waitUntil-registered background promises ONLY under a test
      // runner. In production Node we would otherwise pull webhook delivery
      // latency (possibly seconds) onto the request critical path. On
      // Cloudflare Workers `executionCtx.waitUntil` keeps the worker alive
      // without blocking the response, so this branch is a no-op there.
      if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
        await flushBackgroundPromises(ctx);
      }
    }
    if (error) throw error;
  };
}
