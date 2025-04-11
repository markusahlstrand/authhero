import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
import i18next from "i18next";
import { Bindings, Variables, AuthHeroConfig } from "./types";
import createManagementApi from "./routes/management-api";
import createOauthApi from "./routes/auth-api";
import createUniversalLogin from "./routes/universal-login";
import { createX509Certificate } from "./utils/encryption";
import { en, it, nb, sv, pl, cs, fi } from "./locales";

export * from "@authhero/adapter-interfaces";
export * from "./types/Hooks";
export * from "./components";
export * from "./styles";

i18next.init({
  supportedLngs: ["en", "it", "nb", "sv", "pl", "cs", "fi"],
  fallbackLng: "en",
  resources: {
    en: { translation: en },
    it: { translation: it },
    nb: { translation: nb },
    sv: { translation: sv },
    pl: { translation: pl },
    cs: { translation: cs },
    fi: { translation: fi },
  },
});

export function init(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

  app.get("/", (ctx: Context) => {
    return ctx.json({
      name: "authhero",
    });
  });

  const managementApp = createManagementApi(config);
  app.route("/api/v2", managementApp);

  const oauthApp = createOauthApi(config);
  app.route("/", oauthApp);

  const universalApp = createUniversalLogin(config);
  app.route("/u", universalApp);

  return {
    app,
    managementApp,
    oauthApp,
    universalApp,
    createX509Certificate,
  };
}
