// import { BunSqliteDialect } from "kysely-bun-sqlite";
// import createAdapters from "@authhero/kysely-adapter";
import { serveStatic } from "hono/bun";
// @ts-ignore
import * as bunSqlite from "bun:sqlite";

import createApp from "./app";

const { app } = createApp();

app.use("/static/*", serveStatic({ root: "./" }));

const server = {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, {
      ...process.env,
    });
  },
};

export default server;
