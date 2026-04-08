import { Context, MiddlewareHandler } from "hono";
import { OutboxAdapter } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { waitUntil } from "../helpers/wait-until";
import {
  processOutboxEvents,
  EventDestination,
} from "../helpers/outbox-relay";

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
    ctx.set("outboxEventIds", []);
    let error: unknown;
    try {
      await next();
    } catch (e) {
      error = e;
    } finally {
      const eventIds = ctx.var.outboxEventIds ?? [];
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
    }
    if (error) throw error;
  };
}
