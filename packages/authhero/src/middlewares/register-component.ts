import { OpenAPIHono } from "@hono/zod-openapi";
import { Context, Next } from "hono";
import { Bindings, Variables } from "../types";

let inititated = false;

/**
 * This registers the security scheme for the application. As it uses an environment variable, it can only be registered once the first request arrives.
 * @param app
 */
export function registerComponent(
  app: OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>,
) {
  app.use(async (ctx: Context<{ Bindings: Bindings }>, next: Next) => {
    if (!inititated) {
      app.openAPIRegistry.registerComponent("securitySchemes", "Bearer", {
        type: "oauth2",
        scheme: "bearer",
        flows: {
          implicit: {
            authorizationUrl: `${ctx.env.AUTH_URL}/authorize`,
            scopes: {
              openid: "Basic user information",
              email: "User email",
              profile: "User profile information",
            },
          },
        },
      });

      inititated = true;
    }

    return await next();
  });
}
