import { Context } from "hono";
import { getRuntimeKey } from "hono/adapter";

/**
 * Register a background promise tied to the current request.
 *
 * On Cloudflare Workers (`workerd`), this uses `executionCtx.waitUntil`, which
 * holds the worker alive until the promise settles but does not block the
 * response.
 *
 * On Node/Bun and in tests we instead collect the promise on the context so a
 * surrounding middleware can await it before the response leaves. Without this
 * the response can return before background work (audit log writes, outbox
 * webhook dispatches) completes, producing flaky test behavior and requests
 * that occasionally lose tail work if the process exits.
 */
export function waitUntil(ctx: Context, promise: Promise<unknown>) {
  if (getRuntimeKey() === "workerd") {
    try {
      ctx.executionCtx.waitUntil(promise);
      return;
    } catch {
      // If executionCtx is not available, fall through to the default handler
    }
  }

  const safePromise: Promise<void> = promise.then(
    () => undefined,
    (e) => {
      console.error("waitUntil promise error:", e);
    },
  );

  // Self-initialize the bag if no upstream middleware set one up. This keeps
  // `flushBackgroundPromises` useful in contexts that don't sit behind the
  // outbox middleware (e.g. one-off scripts that still want a clean shutdown).
  // Guard against ctx shapes without `set` (lightweight test mocks fall back
  // to pure fire-and-forget — the `.catch` above still runs).
  let bag: Promise<void>[] | undefined;
  try {
    bag = ctx.var?.backgroundPromises;
  } catch {
    bag = undefined;
  }
  if (!Array.isArray(bag)) {
    if (typeof ctx.set !== "function") return;
    bag = [];
    ctx.set("backgroundPromises", bag);
  }
  bag.push(safePromise);
}

/**
 * Await any `waitUntil` promises registered during the current request. Invoke
 * from a middleware's finally block (after `await next()`) so non-Workers
 * runtimes flush background work before returning the response.
 */
export async function flushBackgroundPromises(ctx: Context): Promise<void> {
  const bag = ctx.var.backgroundPromises;
  if (!Array.isArray(bag) || bag.length === 0) return;
  const pending = bag.splice(0, bag.length);
  await Promise.all(pending);
}
