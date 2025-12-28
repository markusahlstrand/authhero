import { Context } from "hono";
import { getRuntimeKey } from "hono/adapter";

// This function is used to do fire and forget calls that are executed after the response has been sent.
export function waitUntil(ctx: Context, promise: Promise<unknown>) {
  if (getRuntimeKey() === "workerd") {
    try {
      ctx.executionCtx.waitUntil(promise);
    } catch {
      // If executionCtx is not available, just await the promise
      // This can happen in certain test environments or local dev setups
      promise.catch((e) => console.error("waitUntil promise error:", e));
    }
  }
}
