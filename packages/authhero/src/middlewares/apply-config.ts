import { MiddlewareHandler } from "hono";
import { AuthHeroConfig, Bindings, Variables } from "../types";

/**
 * Merges values from the user-supplied `AuthHeroConfig` into `ctx.env`. Must
 * run before any code that reads `ctx.env.hooks`, `ctx.env.samlSigner`, etc.
 *
 * Applied both in the outer `init()` app and in each sub-app's middleware
 * chain so that serving a sub-app (oauthApp, managementApp, ...) directly —
 * without routing through the outer app — still sees the config.
 *
 * `ctx.env` is replaced with a shallow copy before anything is written to it.
 * On Cloudflare Workers the runtime hands every request in an isolate the SAME
 * `env` object, and the routes store per-request state on it (`ctx.env.data =
 * composeAuthData({ ctx, ... })`). Writing to the shared object let concurrent
 * requests overwrite each other's adapter stack, so one request awaited
 * another request's in-flight promises — which the runtime cancels as a hung
 * Worker once the owning request ends.
 */
export function applyConfigMiddleware(
  config: AuthHeroConfig,
): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> {
  return async (ctx, next) => {
    ctx.env = { ...(ctx.env ?? {}) } as Bindings;

    if (!ctx.env.data && config.dataAdapter) {
      ctx.env.data = config.dataAdapter;
    }

    if (config.hooks) {
      ctx.env.hooks = {
        ...config.hooks,
        ...(ctx.env.hooks || {}),
      };
    }

    if (config.samlSigner) {
      ctx.env.samlSigner = config.samlSigner;
    }

    if (config.poweredByLogo) {
      ctx.env.poweredByLogo = config.poweredByLogo;
    }

    if (ctx.env.codeExecutor == null && config.codeExecutor) {
      ctx.env.codeExecutor = config.codeExecutor;
    }

    if (config.webhookInvoker) {
      ctx.env.webhookInvoker = config.webhookInvoker;
    }

    if (config.tenantUpgrade) {
      ctx.env.tenantUpgrade = config.tenantUpgrade;
    }

    if (config.usersImportMaxBytes !== undefined) {
      ctx.env.usersImportMaxBytes = config.usersImportMaxBytes;
    }

    if (config.usersImportMaxConcurrentJobs !== undefined) {
      ctx.env.usersImportMaxConcurrentJobs =
        config.usersImportMaxConcurrentJobs;
    }

    if (config.unsafeAllowAzpCustomClaim !== undefined) {
      ctx.env.unsafeAllowAzpCustomClaim = config.unsafeAllowAzpCustomClaim;
    }

    if (config.tenantOperationExecutor) {
      ctx.env.tenantOperationExecutor = config.tenantOperationExecutor;
    }

    if (config.outbox) {
      ctx.env.outbox = config.outbox;
    }

    if (config.userLinkingMode) {
      ctx.env.userLinkingMode = config.userLinkingMode;
    }

    if (config.usernamePasswordProvider) {
      ctx.env.usernamePasswordProvider = config.usernamePasswordProvider;
    }

    if (config.signingKeyMode) {
      ctx.env.signingKeyMode = config.signingKeyMode;
    }

    if (config.mcp) {
      ctx.env.mcp = config.mcp;
    }

    return next();
  };
}
