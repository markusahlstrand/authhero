import { Context } from "hono";
import { getRuntimeKey } from "hono/adapter";

// This function is used to do fire and forget calls that are executed after the response has been sent.
export function waitUntil(ctx: Context, promise: Promise<unknown>) {
  if (getRuntimeKey() === "workerd") {
    try {
      ctx.executionCtx.waitUntil(promise);
      return;
    } catch {
      // If executionCtx is not available, fall through to the default handler
    }
  }

  // For non-workerd runtimes (Node, Bun, etc.), fire-and-forget with error logging
  promise.catch((e) => console.error("waitUntil promise error:", e));
}
