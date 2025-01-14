import { OpenAPIHono } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { DataAdapters } from "@authhero/adapter-interfaces";

export interface CreateAuthParams {
  dataAdapter: DataAdapters;
}

export default function create() {
  const app = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  const universalApp = app;

  universalApp.doc("/u/spec", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Universal login",
    },
  });

  return universalApp;
}
