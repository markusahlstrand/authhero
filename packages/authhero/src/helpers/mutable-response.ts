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
 * Return a response whose headers are mutable. A received response is re-wrapped
 * into a fresh `Response` (which has the mutable "response" header guard); an
 * already-mutable response is re-wrapped too, harmlessly, preserving every header
 * already set on it.
 *
 * A `101 Switching Protocols` upgrade is returned untouched: it carries a
 * `webSocket` handle that reconstruction would drop, breaking the upgrade. Its
 * headers stay immutable, so callers must not write to an upgrade response.
 */
export function toMutableResponse(res: Response): Response {
  if (res.status === 101 || "webSocket" in res) return res;
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
