import { drizzle } from "drizzle-orm/d1";
import createAdapters from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import { seed, createEncryptedDataAdapter, loadEncryptionKey } from "authhero";

interface Env {
  AUTH_DB: D1Database;
  ENCRYPTION_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const adminUsername = url.searchParams.get("username") || "admin";
    const adminPassword = url.searchParams.get("password") || "admin";
    const issuer = `${url.protocol}//${url.host}/`;

    try {
      const db = drizzle(env.AUTH_DB, { schema });
      let adapters = createAdapters(db, { useTransactions: false });

      if (env.ENCRYPTION_KEY) {
        const encryptionKey = await loadEncryptionKey(env.ENCRYPTION_KEY);
        adapters = createEncryptedDataAdapter(adapters, encryptionKey);
      }

      const result = await seed(adapters, {
        adminUsername,
        adminPassword,
        issuer,
        tenantId: "control_plane",
        tenantName: "Control Plane",
        isControlPlane: true,
        clientId: "default",
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Control plane seeded successfully",
          result,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Seed error:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to seed database",
          message: error instanceof Error ? error.message : String(error),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
