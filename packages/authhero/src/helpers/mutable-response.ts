/**
 * Normalizing a response so middleware can write headers onto it.
 *
 * A response that the worker *received* — from `fetch()`, a Workers-for-Platforms
 * dispatch (`DISPATCHER.get(name).fetch()`), the Cache API, or R2 — carries an
 * *immutable* header guard. Calling `headers.set()` / `headers.append()` on it
 * throws `TypeError: Can't modify immutable headers.`. Responses built in-worker
 * (`c.json()`, `c.text()`, `new Response(...)`) are mutable.
 *
 * Any middleware that annotates the response after `next()` (CORS, Server-Timing,
 * `Preference-Applied`, …) must therefore tolerate an immutable response. Rather
 * than guard each write with a try/catch, normalize once: re-wrapping is cheap
 * (the body stream is passed through, not copied) and deterministic, so there is
 * nothing to detect.
 */

/**
 * True only for a live WebSocket upgrade — a `101 Switching Protocols` response
 * that carries a non-null `webSocket` handle.
 *
 * The check must NOT be `"webSocket" in res`: the Cloudflare Workers runtime
 * defines a `webSocket` property on *every* `Response` (it is `null` for an
 * ordinary response), so the `in` operator is always true there and would
 * misclassify every response as an upgrade. (In Node / the test runtime the
 * property is absent, so the bug stays invisible to tests.) A real upgrade has
 * a non-null handle, which is what we detect here.
 */
export function isWebSocketUpgrade(res: Response): boolean {
  const webSocket: unknown = Reflect.get(res, "webSocket");
  return res.status === 101 || webSocket != null;
}

/**
 * Return a response whose headers are mutable. A received response is re-wrapped
 * into a fresh `Response` (which has the mutable "response" header guard); an
 * already-mutable response is re-wrapped too, harmlessly, preserving every header
 * already set on it.
 *
 * A WebSocket upgrade is returned untouched: it carries a `webSocket` handle
 * that reconstruction would drop, breaking the upgrade. Its headers stay
 * immutable, so callers must not write to an upgrade response.
 */
export function toMutableResponse(res: Response): Response {
  if (isWebSocketUpgrade(res)) return res;
  return new Response(res.body, res);
}

/**
 * Ensure `c.res` is safe to write headers onto, re-wrapping a received
 * (immutable) response in place. Typed structurally so it accepts any Hono
 * `Context` regardless of its `Bindings`/`Variables` generics.
 *
 * Note the 101 carve-out in {@link toMutableResponse}: for an upgrade response
 * this is a no-op and the headers remain immutable, so a caller that may face a
 * 101 must still skip its header writes for it.
 */
export function ensureMutableResponse(c: { res: Response }): void {
  c.res = toMutableResponse(c.res);
}
