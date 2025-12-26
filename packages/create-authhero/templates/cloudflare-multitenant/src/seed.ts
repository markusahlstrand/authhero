import { D1Dialect } from "kysely-d1";
import { Kysely } from "kysely";
import createAdapters from "@authhero/kysely-adapter";
import { seed } from "@authhero/multi-tenancy";

interface Env {
  AUTH_DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const adminEmail = url.searchParams.get("email");
    const adminPassword = url.searchParams.get("password");
    // Compute issuer from the request URL (for Management API identifier)
    const issuer = `${url.protocol}//${url.host}/`;

    if (!adminEmail || !adminPassword) {
      return new Response(
        JSON.stringify({
          error: "Missing email or password query parameters",
          usage: "/?email=admin@example.com&password=yourpassword",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      const dialect = new D1Dialect({ database: env.AUTH_DB });
      const db = new Kysely<any>({ dialect });
      const adapters = createAdapters(db);

      const result = await seed(adapters, {
        adminEmail,
        adminPassword,
        issuer,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Database seeded successfully",
          result,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Seed error:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to seed database",
          message: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
