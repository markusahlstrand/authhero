/**
 * The per-trigger allowlist of namespaced API methods exposed to user-authored
 * code hooks. Each entry maps a trigger id to `{ namespace: [method, ...] }`.
 *
 * Code hooks run in an isolate with a **recording** `api` proxy: user code calls
 * `api.<namespace>.<method>(...)`, the call is captured as
 * `{ method: "<namespace>.<method>", args }`, and the host replays it against
 * the real API objects after the isolate returns. This shape is what the proxy
 * is built from, so it is the single source of truth for *which* verbs a trigger
 * exposes.
 *
 * It lives here (not in an executor) because both executors need an identical
 * copy: the local `LocalCodeExecutor` builds the proxy in-process, and the
 * Cloudflare `WorkerLoaderCodeExecutor` serializes this object into the
 * generated worker script. Duplicating it risked the two drifting; importing
 * this const keeps them byte-identical by construction.
 */
export const TRIGGER_API_SHAPES: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = {
  "post-user-login": {
    accessToken: ["setCustomClaim"],
    idToken: ["setCustomClaim"],
    access: ["deny"],
    prompt: ["render"],
    redirect: ["sendUserTo"],
    // Programmable account linking: an action reads `event.link_candidates`
    // and calls `api.user.setLinkedTo(candidate.user_id)`. The write is guarded
    // host-side (candidate allowlist + verified-email gate) — see the
    // post-user-login dispatch.
    user: ["setLinkedTo"],
  },
  "credentials-exchange": {
    accessToken: ["setCustomClaim"],
    idToken: ["setCustomClaim"],
    access: ["deny"],
  },
  "pre-user-registration": {
    user: ["setUserMetadata", "setLinkedTo"],
    access: ["deny"],
  },
  "post-user-registration": {},
};

/**
 * A single candidate primary the built-in email-based linking policy would
 * consider, pre-resolved into a `post-user-login` code-hook event as
 * `event.link_candidates`. Code hooks have no return channel and no data
 * adapter, so link targets must be pushed *into* the event rather than looked
 * up from user code. The shape is intentionally minimal and JSON-serializable.
 */
export interface LinkCandidate {
  user_id: string;
  email: string;
  email_verified: boolean;
  provider: string;
  connection: string;
  created_at: string;
  /** No `linked_to` set — this user is itself a primary. */
  is_primary: boolean;
  /** The candidate the built-in "oldest account wins" policy would pick. */
  is_oldest: boolean;
}
