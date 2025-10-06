import { Context } from "hono";
import { Log, LogType } from "@authhero/adapter-interfaces";
import { Variables, Bindings } from "../types";

export type LogParams = {
  type: LogType;
  description?: string;
  userId?: string;
  body?: unknown;
  strategy?: string;
  strategy_type?: string;
  connection?: string;
};

export function createLogMessage(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: LogParams,
) {
  const log: Log = {
    type: params.type,
    description: params.description || "",
    ip: ctx.var.ip,
    user_agent: ctx.var.useragent || "",
    auth0_client: ctx.var.auth0_client,
    date: new Date().toISOString(),
    details: {
      request: {
        method: ctx.req.method,
        path: ctx.req.path,
        qs: ctx.req.queries(),
        body: params.body || ctx.var.body || "",
      },
    },
    isMobile: false,
    client_id: ctx.var.client_id,
    client_name: "",
    user_id: params.userId || ctx.var.user_id || "",
    hostname: ctx.req.header("host") || "",
    user_name: ctx.var.username || "",
    connection_id: "",
    connection: params.connection || ctx.var.connection || "",
    strategy: params.strategy || "",
    strategy_type: params.strategy_type || "",
    audience: "",
    scope: [],
  };

  return log;
}
