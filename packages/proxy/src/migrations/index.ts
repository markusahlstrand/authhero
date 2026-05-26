import { Migration } from "kysely/migration";
import * as createProxyRoutes from "./2026-05-26T00:00:00_create_proxy_routes";

const migrations: Record<string, Migration> = {
  "2026-05-26T00:00:00_create_proxy_routes": createProxyRoutes,
};

export default migrations;
