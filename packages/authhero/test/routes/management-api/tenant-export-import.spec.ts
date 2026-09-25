import { describe, it, expect } from "vitest";
import { gunzipSync, gzipSync } from "node:zlib";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { seedTenant } from "../../helpers/seed-tenant";

const TENANT = "tenantId";

type Line = { entity: string; data: Record<string, unknown> };

describe("management-api tenant export/import", () => {
  async function setup() {
    const { managementApp, env } = await getTestServer();
    const request = async (
      path: string,
      init: {
        method?: string;
        body?: BodyInit;
        tenant?: string;
        token?: string;
      } = {},
    ) => {
      const token = init.token ?? (await getAdminToken());
      return managementApp.request(
        path,
        {
          method: init.method,
          body: init.body,
          headers: {
            authorization: `Bearer ${token}`,
            "tenant-id": init.tenant ?? TENANT,
          },
        },
        env,
      );
    };
    return { env, request };
  }

  const parseNdjson = (text: string): Line[] =>
    text
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

  const toNdjson = (lines: Line[]) =>
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n";

  const exportLines = async (
    request: Awaited<ReturnType<typeof setup>>["request"],
    tenant = TENANT,
  ) => {
    const res = await request("/tenant-data/export?gzip=false", { tenant });
    expect(res.status).toBe(200);
    return parseNdjson(await res.text());
  };

  const clientIds = (lines: Line[]) =>
    lines.filter((l) => l.entity === "clients").map((l) => l.data.client_id);

  describe("GET /tenant-data/export", () => {
    it("returns gzipped NDJSON by default", async () => {
      const { env, request } = await setup();
      await env.data.clients.create(TENANT, {
        client_id: "export-client",
        name: "Export Client",
        callbacks: [],
      });

      const res = await request("/tenant-data/export");

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/gzip");
      expect(res.headers.get("content-disposition")).toBe(
        `attachment; filename="${TENANT}-export.jsonl.gz"`,
      );
      const lines = parseNdjson(
        gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8"),
      );
      expect(lines[0].entity).toBe("tenants");
      expect(clientIds(lines)).toContain("export-client");
    });

    it("returns plain NDJSON when gzip=false", async () => {
      const { env, request } = await setup();
      await env.data.clients.create(TENANT, {
        client_id: "export-client",
        name: "Export Client",
        callbacks: [],
      });

      const res = await request("/tenant-data/export?gzip=false");

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/x-ndjson");
      expect(res.headers.get("content-disposition")).toBe(
        `attachment; filename="${TENANT}-export.jsonl"`,
      );
      const lines = parseNdjson(await res.text());
      const tenantLine = lines.find((l) => l.entity === "tenants");
      expect(tenantLine?.data.id).toBe(TENANT);
      const client = lines.find(
        (l) => l.entity === "clients" && l.data.client_id === "export-client",
      );
      expect(client?.data.name).toBe("Export Client");
    });

    it("omits passwords unless include_password_hashes is requested", async () => {
      const { env, request } = await setup();
      const user = await env.data.users.create(TENANT, {
        user_id: "auth2|pw-user",
        email: "pw@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });
      await env.data.passwords.create(TENANT, {
        user_id: user.user_id,
        password: "$2b$10$hashhashhashhashhashhash",
        algorithm: "bcrypt",
      });

      const plain = await exportLines(request);
      expect(plain.some((l) => l.entity === "passwords")).toBe(false);
    });

    it("returns 403 for include_password_hashes without read:user_password_hashes", async () => {
      const { request } = await setup();

      const res = await request(
        "/tenant-data/export?gzip=false&include_password_hashes=true",
      );

      expect(res.status).toBe(403);
    });

    it("includes password hashes with the read:user_password_hashes permission", async () => {
      const { env, request } = await setup();
      const user = await env.data.users.create(TENANT, {
        user_id: "auth2|pw-user",
        email: "pw@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });
      await env.data.passwords.create(TENANT, {
        user_id: user.user_id,
        password: "$2b$10$hashhashhashhashhashhash",
        algorithm: "bcrypt",
      });
      const token = await getAdminToken({
        permissions: ["read:users", "read:user_password_hashes"],
      });

      const res = await request(
        "/tenant-data/export?gzip=false&include_password_hashes=true",
        { token },
      );

      expect(res.status).toBe(200);
      const passwords = parseNdjson(await res.text()).filter(
        (l) => l.entity === "passwords",
      );
      expect(passwords).toHaveLength(1);
      expect(passwords[0].data.user_id).toBe("auth2|pw-user");
    });

    it("accepts the hash scope from the space-delimited scope claim", async () => {
      const { request } = await setup();
      const token = await getAdminToken({
        scope: "openid read:user_password_hashes",
      });

      const res = await request(
        "/tenant-data/export?gzip=false&include_password_hashes=true",
        { token },
      );

      expect(res.status).toBe(200);
    });

    it("does not include another tenant's data", async () => {
      const { env, request } = await setup();
      await seedTenant(env.data, "otherTenant", { clientId: "other-client" });
      await env.data.clients.create(TENANT, {
        client_id: "mine",
        name: "Mine",
        callbacks: [],
      });

      const lines = await exportLines(request);

      expect(clientIds(lines)).toContain("mine");
      expect(clientIds(lines)).not.toContain("other-client");
      expect(JSON.stringify(lines)).not.toContain("otherTenant");
    });
  });

  describe("POST /tenant-data/import", () => {
    const sourceLines: Line[] = [
      {
        entity: "clients",
        data: {
          client_id: "imported-client",
          name: "Imported Client",
          callbacks: ["https://example.com/cb"],
        },
      },
      {
        entity: "roles",
        data: { name: "imported-role", description: "Imported" },
      },
    ];

    it("imports plain NDJSON and reports per-entity counts", async () => {
      const { env, request } = await setup();

      const res = await request("/tenant-data/import", {
        method: "POST",
        body: toNdjson(sourceLines),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        counts: Record<string, number>;
        errors: unknown[];
      };
      expect(body.errors).toEqual([]);
      expect(body.counts).toEqual({ clients: 1, roles: 1 });

      const client = await env.data.clients.get(TENANT, "imported-client");
      expect(client?.name).toBe("Imported Client");
      const roles = await env.data.roles.list(TENANT, {});
      expect(roles.roles.map((r) => r.name)).toContain("imported-role");
    });

    it("imports gzipped NDJSON", async () => {
      const { env, request } = await setup();

      const res = await request("/tenant-data/import", {
        method: "POST",
        body: gzipSync(Buffer.from(toNdjson(sourceLines))),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { counts: Record<string, number> };
      expect(body.counts).toEqual({ clients: 1, roles: 1 });
      expect(
        await env.data.clients.get(TENANT, "imported-client"),
      ).toBeTruthy();
    });

    it("round-trips an export back into another tenant", async () => {
      const { env, request } = await setup();
      await env.data.clients.create(TENANT, {
        client_id: "roundtrip",
        name: "Round Trip",
        callbacks: [],
      });
      await seedTenant(env.data, "targetTenant");

      const exported = await request("/tenant-data/export");
      const res = await request("/tenant-data/import", {
        method: "POST",
        body: Buffer.from(await exported.arrayBuffer()),
        tenant: "targetTenant",
      });

      expect(res.status).toBe(200);
      const client = await env.data.clients.get("targetTenant", "roundtrip");
      expect(client?.name).toBe("Round Trip");
    });

    it("reports per-row failures without failing the request", async () => {
      const { request } = await setup();

      const res = await request("/tenant-data/import", {
        method: "POST",
        body: toNdjson([
          ...sourceLines,
          { entity: "not_an_entity", data: { foo: "bar" } },
        ]),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        counts: Record<string, number>;
        errors: { entity: string }[];
      };
      expect(body.counts.clients).toBe(1);
      expect(body.errors.map((e) => e.entity)).toContain("not_an_entity");
    });

    it("returns 400 for malformed JSON", async () => {
      const { request } = await setup();

      const res = await request("/tenant-data/import", {
        method: "POST",
        body: "{not json\n",
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for lines that are not { entity, data } records", async () => {
      const { request } = await setup();

      const res = await request("/tenant-data/import", {
        method: "POST",
        body: JSON.stringify({ foo: "bar" }) + "\n",
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for a corrupt gzip payload", async () => {
      const { request } = await setup();
      const corrupt = Buffer.concat([
        Buffer.from([0x1f, 0x8b, 0x08, 0x00]),
        Buffer.from("this is definitely not deflate data"),
      ]);

      const res = await request("/tenant-data/import", {
        method: "POST",
        body: corrupt,
      });

      expect(res.status).toBe(400);
    });

    it("returns 403 for include_password_hashes without create:user_password_hashes", async () => {
      const { env, request } = await setup();

      const res = await request(
        "/tenant-data/import?include_password_hashes=true",
        { method: "POST", body: toNdjson(sourceLines) },
      );

      expect(res.status).toBe(403);
      expect(await env.data.clients.get(TENANT, "imported-client")).toBeFalsy();
    });

    it("imports password hashes with the create:user_password_hashes permission", async () => {
      const { env, request } = await setup();
      const token = await getAdminToken({
        permissions: ["create:users", "create:user_password_hashes"],
      });
      const lines: Line[] = [
        {
          entity: "users",
          data: {
            user_id: "auth2|imported",
            email: "imported@example.com",
            email_verified: true,
            provider: "auth2",
            connection: "Username-Password-Authentication",
            is_social: false,
          },
        },
        {
          entity: "passwords",
          data: {
            user_id: "auth2|imported",
            password: "$2b$10$hashhashhashhashhashhash",
            algorithm: "bcrypt",
          },
        },
      ];

      const res = await request(
        "/tenant-data/import?include_password_hashes=true",
        { method: "POST", body: toNdjson(lines), token },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        counts: Record<string, number>;
        errors: unknown[];
      };
      expect(body.errors).toEqual([]);
      expect(body.counts).toMatchObject({ users: 1, passwords: 1 });
      const passwords = await env.data.passwords.list(TENANT, "auth2|imported");
      expect(passwords).toHaveLength(1);
    });

    it("only writes into the calling tenant", async () => {
      const { env, request } = await setup();
      await seedTenant(env.data, "otherTenant");

      const res = await request("/tenant-data/import", {
        method: "POST",
        body: toNdjson(sourceLines),
      });

      expect(res.status).toBe(200);
      expect(
        await env.data.clients.get(TENANT, "imported-client"),
      ).toBeTruthy();
      expect(
        await env.data.clients.get("otherTenant", "imported-client"),
      ).toBeFalsy();
      const otherRoles = await env.data.roles.list("otherTenant", {});
      expect(otherRoles.roles).toHaveLength(0);
    });
  });
});
