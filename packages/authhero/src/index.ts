import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
import i18next from "i18next";
import { Bindings, Variables, AuthHeroConfig } from "./types";
import createManagementApi from "./routes/management-api";
import createOauthApi from "./routes/auth-api";
import createUniversalLogin from "./routes/universal-login";
import createSamlpApi from "./routes/saml";
import { createX509Certificate } from "./utils/encryption";
import { en, it, nb, sv, pl, cs, fi, da } from "./locales";

export * from "@authhero/adapter-interfaces";
export * from "./types/Hooks";
export * from "./types/AuthHeroConfig";
export * from "./components";
export * from "./styles";
export * from "./adapters";

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

  // Add middleware to merge config hooks with env hooks (backwards compatibility)
  app.use("*", async (ctx, next) => {
    // Merge config hooks with env hooks, giving precedence to env hooks for backwards compatibility
    if (config.hooks) {
      ctx.env.hooks = {
        ...config.hooks,
        ...(ctx.env.hooks || {}), // env hooks take precedence
      };
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
    createX509Certificate,
  };
}
