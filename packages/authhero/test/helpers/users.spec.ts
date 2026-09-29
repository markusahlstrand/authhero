import { describe, it, expect, vi } from "vitest";
import { UserDataAdapter } from "@authhero/adapter-interfaces";
import { getTestServer } from "./test-server";
import {
  compareUsersByLastLogin,
  getLastUsedUserByEmail,
  getPrimaryUserByEmail,
  linkUserTo,
  resolveClusterRootId,
  userExistsByEmail,
} from "../../src/helpers/users";

const EMAIL = "duplicate@example.com";

/**
 * Seed the shape this suite is about: two *unlinked primaries* sharing an
 * email. That's the steady state on tenants running with `userLinkingMode:
 * "off"` — a database account and a social account for the same person, which
 * Auth0 also leaves unlinked by default.
 *
 * The social account is deliberately the older one, so any helper that picks
 * by age returns it and any helper that picks by recency returns the password
 * account. Every assertion below can therefore tell the two policies apart.
 */
async function seedDuplicatePrimaries(users: UserDataAdapter) {
  const social = await users.create("tenantId", {
    user_id: "google-oauth2|dup-social",
    email: EMAIL,
    email_verified: true,
    provider: "google-oauth2",
    connection: "google-oauth2",
    is_social: true,
    created_at: "2026-07-04T13:50:29.977Z",
    last_login: "2026-07-18T16:53:16.633Z",
    app_metadata: { strategy: "google-oauth2" },
  });

  const password = await users.create("tenantId", {
    user_id: "auth0|dup-password",
    email: EMAIL,
    email_verified: true,
    provider: "auth0",
    connection: "password",
    is_social: false,
    created_at: "2026-07-18T16:54:08.334Z",
    last_login: "2026-08-07T15:46:27.838Z",
    app_metadata: { strategy: "Username-Password-Authentication" },
  });

  return { social, password };
}

describe("userExistsByEmail", () => {
  it("is true for an email that has a user", async () => {
    const { env } = await getTestServer();

    await expect(
      userExistsByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      }),
    ).resolves.toBe(true);
  });

  it("is false for an unknown email", async () => {
    const { env } = await getTestServer();

    await expect(
      userExistsByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "nobody@example.com",
      }),
    ).resolves.toBe(false);
  });

  it("is true when several unlinked primaries share the email", async () => {
    const { env } = await getTestServer();
    await seedDuplicatePrimaries(env.data.users);

    await expect(
      userExistsByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: EMAIL,
      }),
    ).resolves.toBe(true);
  });

  it("is true when only a secondary carries the email", async () => {
    const { env } = await getTestServer();
    await env.data.users.create("tenantId", {
      user_id: "auth0|secondary-only",
      email: "secondary@example.com",
      email_verified: true,
      provider: "auth0",
      connection: "password",
      is_social: false,
      linked_to: "email|userId",
    });

    await expect(
      userExistsByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "secondary@example.com",
      }),
    ).resolves.toBe(true);
  });
});

describe("getLastUsedUserByEmail", () => {
  it("returns the account used most recently, not the oldest one", async () => {
    const { env } = await getTestServer();
    const { social, password } = await seedDuplicatePrimaries(env.data.users);

    const lastUsed = await getLastUsedUserByEmail({
      userAdapter: env.data.users,
      tenant_id: "tenantId",
      email: EMAIL,
    });

    expect(lastUsed?.user_id).toBe(password.user_id);

    // The linking policy still picks the oldest — the two answers differ on
    // purpose, and that difference is the point of the separate helper.
    const primary = await getPrimaryUserByEmail({
      userAdapter: env.data.users,
      tenant_id: "tenantId",
      email: EMAIL,
    });
    expect(primary?.user_id).toBe(social.user_id);
  });

  it("sorts accounts that never logged in last", async () => {
    const { env } = await getTestServer();
    // Newer account, but the only one with a login recorded.
    await env.data.users.create("tenantId", {
      user_id: "google-oauth2|never-used",
      email: EMAIL,
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      created_at: "2026-07-04T13:50:29.977Z",
    });
    await env.data.users.create("tenantId", {
      user_id: "auth0|used-once",
      email: EMAIL,
      email_verified: true,
      provider: "auth0",
      connection: "password",
      is_social: false,
      created_at: "2026-07-18T16:54:08.334Z",
      last_login: "2026-08-07T15:46:27.838Z",
    });

    const lastUsed = await getLastUsedUserByEmail({
      userAdapter: env.data.users,
      tenant_id: "tenantId",
      email: EMAIL,
    });

    expect(lastUsed?.user_id).toBe("auth0|used-once");
  });

  it("falls back to the oldest account when none has logged in", async () => {
    const { env } = await getTestServer();
    await env.data.users.create("tenantId", {
      user_id: "auth0|newer",
      email: EMAIL,
      email_verified: true,
      provider: "auth0",
      connection: "password",
      is_social: false,
      created_at: "2026-07-18T16:54:08.334Z",
    });
    await env.data.users.create("tenantId", {
      user_id: "google-oauth2|older",
      email: EMAIL,
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      created_at: "2026-07-04T13:50:29.977Z",
    });

    const lastUsed = await getLastUsedUserByEmail({
      userAdapter: env.data.users,
      tenant_id: "tenantId",
      email: EMAIL,
    });

    expect(lastUsed?.user_id).toBe("google-oauth2|older");
  });

  it("resolves to the cluster root when only secondaries match", async () => {
    const { env } = await getTestServer();
    await env.data.users.create("tenantId", {
      user_id: "auth0|linked-secondary",
      email: "linked@example.com",
      email_verified: true,
      provider: "auth0",
      connection: "password",
      is_social: false,
      linked_to: "email|userId",
    });

    const lastUsed = await getLastUsedUserByEmail({
      userAdapter: env.data.users,
      tenant_id: "tenantId",
      email: "linked@example.com",
    });

    expect(lastUsed?.user_id).toBe("email|userId");
  });

  it("returns undefined for a dangling linked_to instead of throwing", async () => {
    const { env } = await getTestServer();
    await env.data.users.create("tenantId", {
      user_id: "auth0|dangling",
      email: "dangling@example.com",
      email_verified: true,
      provider: "auth0",
      connection: "password",
      is_social: false,
      linked_to: "auth0|does-not-exist",
    });

    // A login hint must never 500 the screen — unlike getPrimaryUserByEmail,
    // which throws so linking paths surface the broken cluster.
    await expect(
      getLastUsedUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "dangling@example.com",
      }),
    ).resolves.toBeUndefined();

    await expect(
      getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "dangling@example.com",
      }),
    ).rejects.toThrow("Primary account not found");
  });
});

describe("getPrimaryUserByEmail duplicate-primary logging", () => {
  it("stays quiet by default", async () => {
    const { env } = await getTestServer();
    await seedDuplicatePrimaries(env.data.users);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: EMAIL,
      });

      // With linking off, several primaries per email is the expected steady
      // state — logging an error on every identifier POST would be noise.
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("logs when the caller opts in", async () => {
    const { env } = await getTestServer();
    await seedDuplicatePrimaries(env.data.users);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: EMAIL,
        warnOnMultiplePrimaries: true,
      });

      expect(consoleError).toHaveBeenCalledWith(
        "More than one primary user found for same email",
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does not log for a single primary", async () => {
    const { env } = await getTestServer();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
        warnOnMultiplePrimaries: true,
      });

      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("compareUsersByLastLogin", () => {
  const base = {
    user_id: "auth0|a",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    email: EMAIL,
    provider: "auth0",
    connection: "password",
    is_social: false,
    login_count: 0,
  };

  it("orders the most recent login first", () => {
    const older = { ...base, last_login: "2026-07-01T00:00:00.000Z" };
    const newer = {
      ...base,
      user_id: "auth0|b",
      last_login: "2026-08-01T00:00:00.000Z",
    };

    expect([older, newer].sort(compareUsersByLastLogin)[0]).toBe(newer);
  });

  it("treats an unparseable last_login as never used", () => {
    const broken = { ...base, last_login: "not-a-date" };
    const valid = {
      ...base,
      user_id: "auth0|b",
      last_login: "2026-07-01T00:00:00.000Z",
    };

    expect([broken, valid].sort(compareUsersByLastLogin)[0]).toBe(valid);
  });
});

describe("linkUserTo", () => {
  const TENANT = "tenantId";

  async function seedUser(
    users: UserDataAdapter,
    tenant_id: string,
    id: string,
    linked_to?: string,
  ) {
    return users.create(tenant_id, {
      user_id: `auth0|${id}`,
      email: `${id}@example.com`,
      email_verified: true,
      provider: "auth0",
      connection: "password",
      is_social: false,
      ...(linked_to ? { linked_to: `auth0|${linked_to}` } : {}),
    });
  }

  async function linkedTo(
    users: UserDataAdapter,
    tenant_id: string,
    id: string,
  ) {
    return (await users.get(tenant_id, `auth0|${id}`))?.linked_to;
  }

  it("rejects linking a primary onto its own secondary and leaves both rows unchanged", async () => {
    const { env } = await getTestServer();
    const users = env.data.users;
    await seedUser(users, TENANT, "f");
    await seedUser(users, TENANT, "n", "f");

    await expect(
      linkUserTo({
        userAdapter: users,
        tenant_id: TENANT,
        userId: "auth0|f",
        primaryId: "auth0|n",
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(await linkedTo(users, TENANT, "f")).toBeUndefined();
    expect(await linkedTo(users, TENANT, "n")).toBe("auth0|f");
  });

  it("rejects linking a user to itself", async () => {
    const { env } = await getTestServer();
    const users = env.data.users;
    await seedUser(users, TENANT, "solo");

    await expect(
      linkUserTo({
        userAdapter: users,
        tenant_id: TENANT,
        userId: "auth0|solo",
        primaryId: "auth0|solo",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await linkedTo(users, TENANT, "solo")).toBeUndefined();
  });

  it("moves every secondary of a demoted primary exactly one hop to the new root", async () => {
    const { env } = await getTestServer();
    const users = env.data.users;
    await seedUser(users, TENANT, "root");
    await seedUser(users, TENANT, "old");
    await seedUser(users, TENANT, "s1", "old");
    await seedUser(users, TENANT, "s2", "old");
    await seedUser(users, TENANT, "s3", "old");

    const rootId = await linkUserTo({
      userAdapter: users,
      tenant_id: TENANT,
      userId: "auth0|old",
      primaryId: "auth0|root",
    });

    expect(rootId).toBe("auth0|root");
    for (const id of ["old", "s1", "s2", "s3"]) {
      expect(await linkedTo(users, TENANT, id)).toBe("auth0|root");
    }
    expect(await linkedTo(users, TENANT, "root")).toBeUndefined();
  });

  it("resolves a secondary target to its cluster root instead of building a chain", async () => {
    const { env } = await getTestServer();
    const users = env.data.users;
    await seedUser(users, TENANT, "root");
    await seedUser(users, TENANT, "mid", "root");
    await seedUser(users, TENANT, "new");

    const rootId = await linkUserTo({
      userAdapter: users,
      tenant_id: TENANT,
      userId: "auth0|new",
      primaryId: "auth0|mid",
    });

    expect(rootId).toBe("auth0|root");
    expect(await linkedTo(users, TENANT, "new")).toBe("auth0|root");
  });

  it("does not touch another tenant's users", async () => {
    const { env } = await getTestServer();
    const users = env.data.users;
    await env.data.tenants.create({
      id: "otherTenant",
      friendly_name: "Other Tenant",
      audience: "https://other.example.com",
      default_audience: "https://other.example.com",
      sender_email: "login@other.example.com",
      sender_name: "Other",
    });

    // Same user ids in both tenants.
    await seedUser(users, TENANT, "root");
    await seedUser(users, TENANT, "old");
    await seedUser(users, TENANT, "s1", "old");
    await seedUser(users, "otherTenant", "root");
    await seedUser(users, "otherTenant", "old");
    await seedUser(users, "otherTenant", "s1", "old");

    await linkUserTo({
      userAdapter: users,
      tenant_id: TENANT,
      userId: "auth0|old",
      primaryId: "auth0|root",
    });

    expect(await linkedTo(users, TENANT, "s1")).toBe("auth0|root");
    expect(await linkedTo(users, "otherTenant", "old")).toBeUndefined();
    expect(await linkedTo(users, "otherTenant", "s1")).toBe("auth0|old");
    expect(await linkedTo(users, "otherTenant", "root")).toBeUndefined();
  });
});

describe("resolveClusterRootId on corrupt data", () => {
  it("terminates on a hand-seeded 2-cycle instead of looping", async () => {
    const { env } = await getTestServer();
    const users = env.data.users;
    await users.create("tenantId", {
      user_id: "auth0|a",
      email: "a@example.com",
      email_verified: true,
      provider: "auth0",
      connection: "password",
      is_social: false,
      linked_to: "auth0|b",
    });
    await users.create("tenantId", {
      user_id: "auth0|b",
      email: "b@example.com",
      email_verified: true,
      provider: "auth0",
      connection: "password",
      is_social: false,
      linked_to: "auth0|a",
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const resolved = await Promise.race([
        resolveClusterRootId(users, "tenantId", "auth0|a"),
        new Promise<string>((_, reject) =>
          setTimeout(
            () => reject(new Error("resolveClusterRootId hung")),
            2000,
          ),
        ),
      ]);

      // Stops at the last id reached before revisiting a node.
      expect(["auth0|a", "auth0|b"]).toContain(resolved);
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("linked_to cycle detected"),
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
