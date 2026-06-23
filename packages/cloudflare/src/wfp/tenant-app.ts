import { Hono, type Context, type ExecutionContext } from "hono";
import {
  init,
  loadEncryptionKey,
  createEncryptedDataAdapterWithKeyRing,
  type AuthHeroConfig,
  type DataAdapters,
  type IssuerResolver,
} from "authhero";
import {
  withRuntimeFallback,
  applyControlPlaneDefaultsPayload,
  type ControlPlaneDefaultsApplyResult,
  type ControlPlaneDefaultsPayload,
} from "@authhero/multi-tenancy";

const CONTROL_PLANE_KEY_ID = "cp";
const SYNC_PATH = "/internal/sync-defaults";

/**
 * Log the cause and return a structured 500: a stable error `code`, the
 * cause's message as `detail`, an `X-Authhero-Error: <code>` header, and the
 * apply `result` when one exists. Tenant workers run in a dispatch namespace
 * (no `wrangler tail`), so the opaque `{"message":"Internal Server Error"}`
 * the default handler emits is a debugging dead end — this is the only place
 * the cause surfaces.
 */
function errorResponse(
  c: Context,
  code: string,
  cause: unknown,
  result?: ControlPlaneDefaultsApplyResult,
): Response {
  console.error(`[wfp-tenant] ${code}:`, cause);
  const detail = cause instanceof Error ? cause.message : String(cause);
  c.header("X-Authhero-Error", code);
  return c.json({ error: code, detail, result }, 500);
}

/**
 * Env contract for a WFP tenant worker — the bindings + secrets
 * `createCloudflareWfpD1Provisioner` (and the host's `secrets` resolver) set on
 * each tenant script. `AUTH_DB` is the D1 binding; the rest are plain
 * text / secret text.
 */
export interface WfpTenantEnv {
  /** Per-tenant D1 binding. Consumed by the host's `createDataAdapter`. */
  AUTH_DB: unknown;
  /** This tenant's own at-rest encryption key (base64, 32 bytes). */
  ENCRYPTION_KEY: string;
  /** This tenant's JWT `iss`. */
  ISSUER: string;
  /** Control-plane tenant id whose projected defaults this worker inherits. */
  CONTROL_PLANE_TENANT_ID: string;
  /**
   * The control plane's own issuer. Accepted in addition to `ISSUER` so a
   * control-plane-minted admin token forwarded here verifies — its signature is
   * checked against the control plane's PUBLIC keys, which are projected into
   * this tenant's DB (no runtime JWKS fetch).
   */
  CONTROL_PLANE_ISSUER: string;
  /**
   * Key for the `cp` key-ring id — encrypts inherited control-plane rows so the
   * tenant operator can hold but not read them. When omitted, a single key is
   * used for everything.
   */
  CONTROL_PLANE_ENCRYPTION_KEY?: string;
  /** Shared secret authenticating control-plane pushes to `/internal/sync-defaults`. */
  WFP_INTERNAL_SYNC_SECRET?: string;
  [key: string]: unknown;
}

export interface WfpTenantAppOptions<Env extends WfpTenantEnv = WfpTenantEnv> {
  /**
   * Builds the tenant's **base** data adapters from its env (typically
   * `createAdapters(drizzle(env.AUTH_DB))`). Injected so this package carries no
   * ORM dependency — the host owns the `@authhero/drizzle` (or other) import.
   */
  createDataAdapter: (env: Env) => DataAdapters;
  /**
   * Hook to extend or override the authhero config before `init` — add custom
   * hooks, code executors, `signingKeyMode`, extra issuers, etc. Receives the
   * scaffold's base config and the env.
   */
  configure?: (base: AuthHeroConfig, env: Env) => AuthHeroConfig;
  /**
   * Resolver for the issuers accepted *in addition to* this tenant's own
   * `ISSUER`. Defaults to a **gated** resolver that accepts
   * `env.CONTROL_PLANE_ISSUER` **only** for control-plane-minted tokens
   * (`tenant_id === env.CONTROL_PLANE_TENANT_ID`) and `[]` otherwise — so a
   * tenant token can never assert the control-plane issuer. Provide your own
   * resolver to widen or narrow this; it fully replaces the default.
   */
  additionalIssuers?: (env: Env) => IssuerResolver;
  /**
   * When applying a `/internal/sync-defaults` push, keep going past a failing
   * row and collect per-entity errors in the result rather than aborting the
   * whole projection on the first failure. Defaults to `true` — a single bad
   * inherited row shouldn't sink the entire sync into an opaque 500. Set
   * `false` to restore fail-fast.
   */
  continueOnError?: boolean;
  /**
   * Called after a `/internal/sync-defaults` push is applied, with the result
   * that is also returned to the control plane. Use it to log what landed
   * (per-entity `received` / `upserted` / `errors`) without re-implementing the
   * route. A throw here is caught and turns into a structured 500 — the apply
   * has already committed, so treat it as best-effort logging.
   */
  onSyncResult?: (
    result: ControlPlaneDefaultsApplyResult,
    env: Env,
  ) => void | Promise<void>;
}

/** Default additional-issuers resolver: gate the control-plane issuer to control-plane tokens. */
function gatedControlPlaneIssuer<Env extends WfpTenantEnv>(
  env: Env,
): IssuerResolver {
  return ({ tenant_id }) =>
    tenant_id === env.CONTROL_PLANE_TENANT_ID ? [env.CONTROL_PLANE_ISSUER] : [];
}

async function buildTenantApp<Env extends WfpTenantEnv>(
  env: Env,
  options: WfpTenantAppOptions<Env>,
): Promise<Hono> {
  const controlPlaneTenantId = env.CONTROL_PLANE_TENANT_ID;

  // Encrypt this tenant's own rows under its key; inherited control-plane rows
  // under the "cp" key id (so a leaked D1 export can't reveal shared secrets).
  const tenantKey = await loadEncryptionKey(env.ENCRYPTION_KEY);
  const ring = env.CONTROL_PLANE_ENCRYPTION_KEY
    ? {
        default: tenantKey,
        keys: {
          [CONTROL_PLANE_KEY_ID]: await loadEncryptionKey(
            env.CONTROL_PLANE_ENCRYPTION_KEY,
          ),
        },
      }
    : { default: tenantKey };

  const encrypted = createEncryptedDataAdapterWithKeyRing(
    options.createDataAdapter(env),
    ring,
    {
      resolveEncryptKeyId: (tenantId) =>
        tenantId === controlPlaneTenantId ? CONTROL_PLANE_KEY_ID : undefined,
    },
  );

  // Runtime fallback resolves the projected control-plane rows from this same
  // D1 — identical to a colocated tenant, no WFP-specific read code.
  const dataAdapter = withRuntimeFallback(encrypted, {
    controlPlaneTenantId,
  });

  const baseConfig: AuthHeroConfig = {
    dataAdapter,
    // Accept the control plane's issuer for forwarded admin tokens — but only
    // for control-plane tokens (see `gatedControlPlaneIssuer`). The signature
    // is still verified, against the projected control-plane keys.
    additionalIssuers: (options.additionalIssuers ?? gatedControlPlaneIssuer)(
      env,
    ),
  };
  const config = options.configure
    ? options.configure(baseConfig, env)
    : baseConfig;

  const { app: authheroApp } = init(config);

  const app = new Hono();

  // Receive control-plane default pushes (pure push — the only ingress for
  // defaults + verify keys). Registered before the authhero mount so it wins.
  app.post(SYNC_PATH, async (c) => {
    const secret = env.WFP_INTERNAL_SYNC_SECRET;
    const authorization = c.req.header("authorization");
    if (!secret || authorization !== `Bearer ${secret}`) {
      return c.json({ error: "unauthorized" }, 401);
    }

    let payload: ControlPlaneDefaultsPayload;
    try {
      payload = await c.req.json<ControlPlaneDefaultsPayload>();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    let result: ControlPlaneDefaultsApplyResult;
    try {
      // Apply to the key-ring adapter (pre-fallback) so projected secrets are
      // re-encrypted under "cp" and projected verify keys land with no
      // tenant_id. `continueOnError` keeps one bad inherited row from aborting
      // the whole projection into an opaque 500.
      result = await applyControlPlaneDefaultsPayload(
        payload,
        encrypted,
        controlPlaneTenantId,
        { continueOnError: options.continueOnError ?? true },
      );
    } catch (err) {
      // Dispatch-namespace workers can't be `wrangler tail`'d, so an opaque
      // 500 here is a dead end. Always log the cause and return a structured
      // body + `X-Authhero-Error` header so the control plane sees detail.
      return errorResponse(c, "sync_defaults_apply_failed", err);
    }

    if (options.onSyncResult) {
      try {
        await options.onSyncResult(result, env);
      } catch (err) {
        // The apply already committed; the host's logging hook failing
        // shouldn't masquerade as a successful sync, but the result is real.
        return errorResponse(c, "sync_defaults_on_result_failed", err, result);
      }
    }

    return c.json(result);
  });

  app.route("/", authheroApp);

  return app;
}

/**
 * Builds a WFP tenant worker `{ fetch }` handler: key-ring encryption over the
 * tenant's own D1, runtime fallback for inherited control-plane defaults, the
 * `/internal/sync-defaults` push receiver, and the control-plane issuer gate —
 * all from one factory.
 *
 * Pure push: this worker never calls the control plane at request time. Defaults
 * and the control plane's public verify keys arrive only via
 * `/internal/sync-defaults`. The built app is cached per `env` (one build per
 * isolate).
 */
export function createWfpTenantApp<Env extends WfpTenantEnv = WfpTenantEnv>(
  options: WfpTenantAppOptions<Env>,
): {
  fetch: (
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ) => Promise<Response>;
} {
  const cache = new WeakMap<object, Promise<Hono>>();

  return {
    fetch(request, env, ctx) {
      let appPromise = cache.get(env);
      if (!appPromise) {
        appPromise = buildTenantApp(env, options);
        cache.set(env, appPromise);
      }
      return appPromise.then((app) => app.fetch(request, env, ctx));
    },
  };
}
