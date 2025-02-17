import { OpenAPIHono } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { enterEmailRoutes } from "./enter-email";
import { enterCodeRoutes } from "./enter-code";
import { enterPasswordRoutes } from "./enter-password";
import { signupRoutes } from "./signup";

export interface CreateAuthParams {
  dataAdapter: DataAdapters;
}

export default function create() {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  const universalApp = app
    .route("/enter-email", enterEmailRoutes)
    .route("/enter-code", enterCodeRoutes)
    .route("/enter-password", enterPasswordRoutes)
    .route("/reset-password", enterPasswordRoutes)
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
