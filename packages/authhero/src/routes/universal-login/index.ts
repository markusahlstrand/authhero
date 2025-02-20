import { OpenAPIHono } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { enterEmailRoutes } from "./enter-email";
import { enterCodeRoutes } from "./enter-code";
import { enterPasswordRoutes } from "./enter-password";
import { signupRoutes } from "./signup";
import { resetPasswordRoutes } from "./reset-password";
import { forgotPasswordRoutes } from "./forgot-password";
import { checkAccountRoutes } from "./check-account";

export interface CreateAuthParams {
  dataAdapter: DataAdapters;
}

export default function create() {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  const universalApp = app
    .route("/check-account", checkAccountRoutes)
    .route("/enter-email", enterEmailRoutes)
    .route("/enter-code", enterCodeRoutes)
    .route("/enter-password", enterPasswordRoutes)
    .route("/reset-password", resetPasswordRoutes)
    .route("/forgot-password", forgotPasswordRoutes)
    .route("/signup", signupRoutes);

  universalApp.doc("/u/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Universal login",
    },
  });

  return universalApp;
}
