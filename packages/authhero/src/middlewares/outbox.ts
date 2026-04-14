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
      // Non-Workers runtimes: drain waitUntil-registered promises so tests
      // can assert on the outcome of background work (outbox webhook
      // dispatch, audit log writes, etc.). On Cloudflare Workers the
      // executionCtx handles this and flushBackgroundPromises is a no-op.
      await flushBackgroundPromises(ctx);
    }
    if (error) throw error;
  };
}
