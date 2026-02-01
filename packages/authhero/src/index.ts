import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import i18next from "i18next";
import { Bindings, Variables, AuthHeroConfig } from "./types";
import createManagementApi from "./routes/management-api";
import createOauthApi from "./routes/auth-api";
import createUniversalLogin from "./routes/universal-login";
import createU2App from "./routes/universal-login/u2-index";
import createSamlpApi from "./routes/saml";
import { createX509Certificate } from "./utils/encryption";
import { en, it, nb, sv, pl, cs, fi, da } from "./locales";

export * from "@authhero/adapter-interfaces";
export * from "./types/Hooks";
export * from "./types/AuthHeroConfig";
export * from "./components";
export * from "./styles";
export * from "./adapters";
export { waitUntil } from "./helpers/wait-until";
export { cleanupUserSessions } from "./helpers/user-session-cleanup";
export type { UserSessionCleanupParams } from "./helpers/user-session-cleanup";
export { addEntityHooks } from "./helpers/entity-hooks-wrapper";
export { seed, MANAGEMENT_API_SCOPES } from "./seed";
export type { SeedOptions, SeedResult } from "./seed";

// Export middlewares for use by multi-tenancy and other packages
export {
  createAuthMiddleware,
  MANAGEMENT_API_AUDIENCE,
} from "./middlewares/authentication";
export { tenantMiddleware } from "./middlewares/tenant";
export { clientInfoMiddleware } from "./middlewares/client-info";

// Export SAML types and signers for configuration
export type { SamlSigner } from "@authhero/saml/core";
export { HttpSamlSigner } from "@authhero/saml/core";
// LocalSamlSigner is available via @authhero/saml/local-signer for Node.js users

// Export utilities
export { fetchAll } from "./utils/fetchAll";
export type { FetchAllOptions } from "./utils/fetchAll";

i18next.init({
  supportedLngs: ["en", "it", "nb", "sv", "pl", "cs", "fi", "da"],
  fallbackLng: "en",
  resources: {
    en: { translation: en },
    it: { translation: it },
    nb: { translation: nb },
    sv: { translation: sv },
    pl: { translation: pl },
    cs: { translation: cs },
    fi: { translation: fi },
    da: { translation: da },
  },
});

export function init(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

  // Register error handler BEFORE routes so it can catch all errors
  // This ensures HTTPException errors (like 403 Forbidden) are returned with
  // the correct status code instead of being swallowed as 500 errors
  app.onError((err, ctx) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    console.error(err);
    return ctx.json({ message: "Internal Server Error" }, 500);
  });

  // Add middleware to merge config hooks with env hooks (backwards compatibility)
  app.use("*", async (ctx, next) => {
    // Merge config hooks with env hooks, giving precedence to env hooks for backwards compatibility
    if (config.hooks) {
      ctx.env.hooks = {
        ...config.hooks,
        ...(ctx.env.hooks || {}), // env hooks take precedence
      };
    }

    // Add samlSigner from config if provided
    if (config.samlSigner) {
      ctx.env.samlSigner = config.samlSigner;
    }

    // Add poweredByLogo from config if provided
    if (config.poweredByLogo) {
      ctx.env.poweredByLogo = config.poweredByLogo;
    }

    await next();
  });

  app.get("/", (ctx: Context) => {
    return ctx.json({
      name: "authhero",
    });
  });

  const managementApp = createManagementApi(config);
  app.route("/api/v2", managementApp);

  const universalApp = createUniversalLogin(config);
  app.route("/u", universalApp);

  const u2App = createU2App(config);
  app.route("/u2", u2App);

  const samlApp = createSamlpApi(config);
  app.route("/samlp", samlApp);

  const oauthApp = createOauthApi(config);
  app.route("/", oauthApp);

  return {
    app,
    managementApp,
    oauthApp,
    samlApp,
    universalApp,
    u2App,
    createX509Certificate,
  };
}
