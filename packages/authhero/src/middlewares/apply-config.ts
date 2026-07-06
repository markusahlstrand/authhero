import { MiddlewareHandler } from "hono";
import { AuthHeroConfig, Bindings, Variables } from "../types";

/**
 * Merges values from the user-supplied `AuthHeroConfig` into `ctx.env`. Must
 * run before any code that reads `ctx.env.hooks`, `ctx.env.samlSigner`, etc.
 *
 * Applied both in the outer `init()` app and in each sub-app's middleware
 * chain so that serving a sub-app (oauthApp, managementApp, ...) directly —
 * without routing through the outer app — still sees the config.
 */
export function applyConfigMiddleware(
  config: AuthHeroConfig,
): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> {
  return async (ctx, next) => {
    if (!ctx.env) {
      ctx.env = {} as Bindings;
    }

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

    return next();
  };
}
