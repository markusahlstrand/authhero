export class TimeoutError extends Error {
  readonly ms: number;
  constructor(ms: number, label?: string) {
    super(`${label ?? "Operation"} timed out after ${ms}ms`);
    this.name = "TimeoutError";
    this.ms = ms;
  }
}

export function isTimeoutLike(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;
  if (err instanceof Error) {
    return err.name === "AbortError" || err.name === "TimeoutError";
  }
  return false;
}

// Run `op` with an `AbortSignal` that fires after `ms`. Use when the underlying
// call honors abort signals (fetch, Cloudflare Fetcher, Workers fetch). The
// timer is always cleared, even if `op` throws or resolves first.
export function withAbortTimeout<T>(
  ms: number,
  op: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return op(controller.signal).finally(() => clearTimeout(timer));
}

// A signal that aborts as soon as any of `signals` does. Uses `AbortSignal.any`
// where the runtime has it (workerd, Node 20.3+) and a listener-based combiner
// otherwise.
export function anySignal(
  signals: Array<AbortSignal | undefined>,
): AbortSignal | undefined {
  const present = signals.filter((s): s is AbortSignal => s !== undefined);
  if (present.length <= 1) return present[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(present);

  const controller = new AbortController();
  const aborted = present.find((s) => s.aborted);
  if (aborted) {
    controller.abort(aborted.reason);
    return controller.signal;
  }
  const onAbort = () => {
    for (const s of present) s.removeEventListener("abort", onAbort);
    controller.abort(present.find((s) => s.aborted)?.reason);
  };
  for (const s of present) s.addEventListener("abort", onAbort);
  return controller.signal;
}

// Run `op` with a signal that aborts after `ms` or when `parent` aborts, and
// reject with a TimeoutError after `ms` even if `op` ignores the signal. The
// race stays as the fallback for callees that cannot be cancelled (e.g. KV);
// callees that honor the signal stop for real.
export function withDeadline<T>(
  ms: number,
  label: string,
  parent: AbortSignal | undefined,
  op: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const signal = anySignal([parent, controller.signal]) ?? controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new TimeoutError(ms, label);
      controller.abort(err);
      reject(err);
    }, ms);
  });
  return Promise.race([
    Promise.resolve().then(() => op(signal)),
    deadline,
  ]).finally(() => clearTimeout(timer));
}

// Race `p` against a timer. Use when the underlying call does NOT accept an
// AbortSignal (cache adapters, KV). The underlying call keeps
// running on timeout — fine on Workers because the isolate is recycled at
// request end. `label` is folded into the TimeoutError message.
export function withRaceTimeout<T>(
  p: Promise<T>,
  ms: number,
  label?: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms, label)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
