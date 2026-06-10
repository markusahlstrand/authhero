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

// Race `p` against a timer. Use when the underlying call does NOT accept an
// AbortSignal (cache adapters, host resolvers). The underlying call keeps
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
