import { describe, expect, it } from "vitest";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import createAdapters, {
  Database,
  migrateToLatest,
} from "@authhero/kysely-adapter";
import { DataAdapters } from "@authhero/adapter-interfaces";
import {
  EXPORT_ORDER,
  exportTenant,
  importTenant,
} from "../src/helpers/tenant-export-import";

// A fresh, isolated in-memory database — the source and target tenants live in
// SEPARATE databases, mirroring a real PlanetScale -> Workers-for-Platforms D1
// migration (and avoiding collisions on globally-unique columns).
async function freshAdapters(): Promise<DataAdapters> {
  const sqlite = new SQLite(":memory:");
  const db = new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
  await migrateToLatest(db, false);
  return createAdapters(db);
}

async function seed(data: DataAdapters, tenant: string) {
  await data.tenants.create({
    id: tenant,
    friendly_name: `Tenant ${tenant}`,
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "Sender",
  });

  const client = await data.clients.create(tenant, {
    client_id: "c1",
    name: "First Client",
    callbacks: ["https://example.com/cb"],
  });

  const connection = await data.connections.create(tenant, {
    name: "email",
    strategy: "email",
  });

  await data.resourceServers.create(tenant, {
    identifier: "https://api.example.com",
    name: "API",
    scopes: [{ value: "read:things", description: "Read things" }],
  });

  const role = await data.roles.create(tenant, {
    name: "admin",
    description: "Admin role",
  });
  await data.rolePermissions.assign(tenant, role.id, [
    {
      role_id: role.id,
      resource_server_identifier: "https://api.example.com",
      permission_name: "read:things",
    },
  ]);

  const organization = await data.organizations.create(tenant, {
    name: "acme",
  });
  await data.organizationConnections.create(tenant, organization.id, {
    connection_id: connection.id,
  });

  const user = await data.users.create(tenant, {
    user_id: "auth2|u1",
    email: "u1@example.com",
    email_verified: true,
    provider: "auth2",
    connection: "Username-Password-Authentication",
    is_social: false,
  });
  await data.passwords.create(tenant, {
    user_id: user.user_id,
    password: "$2b$10$hashhashhashhashhashhash",
    algorithm: "bcrypt",
  });
  await data.authenticationMethods.create(tenant, {
    user_id: user.user_id,
    type: "email",
  });
  await data.userRoles.create(tenant, user.user_id, role.id);
  await data.userPermissions.create(tenant, user.user_id, {
    resource_server_identifier: "https://api.example.com",
    permission_name: "read:things",
  });
  await data.userOrganizations.create(tenant, {
    user_id: user.user_id,
    organization_id: organization.id,
  });

  await data.customDomains.create(tenant, {
    domain: "auth.example.com",
    type: "auth0_managed_certs",
  });

  await data.emailTemplates.create(tenant, {
    template: "verify_email",
    body: "Hello",
    from: "noreply@example.com",
    subject: "Verify",
    syntax: "liquid",
    includeEmailInRedirect: false,
    enabled: true,
  });

  await data.branding.set(tenant, {
    colors: { primary: "#ffffff", page_background: "#000000" },
  });

  return { client, connection, role, organization, user };
}

describe("tenant export/import round-trip", () => {
  it("recreates durable entities in a fresh database with ids + timestamps preserved", async () => {
    const src = await freshAdapters();
    const dst = await freshAdapters();
    const seeded = await seed(src, "src");

    const lines = await exportTenant(src, "src", {
      includePasswordHashes: true,
    });

    const result = await importTenant(dst, "dst", lines, {
      includePasswordHashes: true,
    });

    // No fatal per-row errors.
    expect(result.errors).toEqual([]);

    // The tenant itself is remapped onto the destination id, and the source id
    // is never recreated in the destination database.
    const dstTenant = await dst.tenants.get("dst");
    expect(dstTenant?.id).toBe("dst");
    expect(await dst.tenants.get("src")).toBeNull();

    // Client id + created_at preserved.
    const dstClient = await dst.clients.get("dst", "c1");
    expect(dstClient?.client_id).toBe("c1");
    expect(dstClient?.created_at).toBe(seeded.client.created_at);

    // User id + created_at preserved.
    const dstUser = await dst.users.get("dst", "auth2|u1");
    expect(dstUser?.user_id).toBe("auth2|u1");
    expect(dstUser?.created_at).toBe(seeded.user.created_at);

    // Password hash carried for the right user.
    const dstPasswords = await dst.passwords.list("dst", "auth2|u1");
    expect(dstPasswords).toHaveLength(1);
    expect(dstPasswords[0].password).toBe("$2b$10$hashhashhashhashhashhash");

    // Role permission carried.
    const dstRolePerms = await dst.rolePermissions.list("dst", seeded.role.id);
    expect(dstRolePerms.some((p) => p.permission_name === "read:things")).toBe(
      true,
    );

    // Organization connection carried.
    const dstOrgConns = await dst.organizationConnections.list(
      "dst",
      seeded.organization.id,
    );
    expect(dstOrgConns).toHaveLength(1);
    expect(dstOrgConns[0].connection_id).toBe(seeded.connection.id);

    // Custom domain carried.
    const dstDomains = await dst.customDomains.list("dst");
    expect(dstDomains.some((d) => d.domain === "auth.example.com")).toBe(true);

    // User role assignment carried.
    const dstUserRoles = await dst.userRoles.list("dst", "auth2|u1");
    expect(dstUserRoles.some((r) => r.id === seeded.role.id)).toBe(true);
  });

  it("emits lines in the FK-safe manifest order", async () => {
    const src = await freshAdapters();
    await seed(src, "src");

    const lines = await exportTenant(src, "src", {
      includePasswordHashes: true,
    });

    // Every emitted entity must be a known manifest entity, and their positions
    // must be non-decreasing — i.e. the export sequence is a subsequence of
    // EXPORT_ORDER, keeping the exporter and the shared manifest in lock-step.
    const positions = lines.map((l) => {
      const index = EXPORT_ORDER.indexOf(l.entity as never);
      expect(index, `unknown export entity "${l.entity}"`).toBeGreaterThan(-1);
      return index;
    });
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
    }
  });

  it("omits password hashes when includePasswordHashes is false", async () => {
    const src = await freshAdapters();
    await seed(src, "src");

    const lines = await exportTenant(src, "src", {
      includePasswordHashes: false,
    });

    expect(lines.some((l) => l.entity === "passwords")).toBe(false);
  });
});
