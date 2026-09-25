import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "./helpers/test-server";

describe("tokenExchangeProfiles adapter", () => {
  let data: Awaited<ReturnType<typeof getTestServer>>["data"];
  const tenantId = "tenantId";
  const otherTenant = "otherTenant";

  const jwtVerification = {
    issuer: "https://issuer.example.com",
    jwks_uri: "https://issuer.example.com/.well-known/jwks.json",
    max_lifetime_seconds: 120,
    require_jti: true,
    user_mapping: {
      type: "connection" as const,
      connection: "Username-Password-Authentication",
      create_if_not_exists: false,
    },
  };

  beforeEach(async () => {
    const server = await getTestServer();
    data = server.data;
    for (const id of [tenantId, otherTenant]) {
      await data.tenants.create({
        id,
        friendly_name: id,
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });
    }
  });

  it("creates, gets, lists, updates and removes", async () => {
    const adapter = data.tokenExchangeProfiles!;

    const created = await adapter.create(tenantId, {
      name: "Legacy tokens",
      subject_token_type: "urn:acme:legacy-token",
      type: "custom_authentication",
      jwt_verification: jwtVerification,
    });
    expect(created.id).toMatch(/^tep_[0-9a-z]{17}$/);
    expect(created.jwt_verification).toMatchObject(jwtVerification);
    expect(created).not.toHaveProperty("action_id");

    const withAction = await adapter.create(tenantId, {
      name: "Action profile",
      subject_token_type: "https://acme.example.com/token",
      type: "custom_authentication",
      action_id: "act_123",
    });
    expect(withAction.action_id).toBe("act_123");
    expect(withAction).not.toHaveProperty("jwt_verification");

    const fetched = await adapter.get(tenantId, created.id);
    expect(fetched).toEqual(created);
    expect(await adapter.get(tenantId, "tep_missing")).toBeNull();

    const listed = await adapter.list(tenantId);
    expect(listed.map((p) => p.id).sort()).toEqual(
      [created.id, withAction.id].sort(),
    );

    expect(
      await adapter.update(tenantId, created.id, {
        name: "Renamed",
        jwt_verification: { ...jwtVerification, issuer: "https://new" },
      }),
    ).toBe(true);
    const updated = await adapter.get(tenantId, created.id);
    expect(updated!.name).toBe("Renamed");
    expect(updated!.subject_token_type).toBe("urn:acme:legacy-token");
    expect(updated!.jwt_verification!.issuer).toBe("https://new");
    expect(await adapter.update(tenantId, "tep_missing", { name: "x" })).toBe(
      false,
    );

    expect(await adapter.remove(tenantId, created.id)).toBe(true);
    expect(await adapter.remove(tenantId, created.id)).toBe(false);
    expect(await adapter.get(tenantId, created.id)).toBeNull();
  });

  it("honours importMetadata", async () => {
    const created = await data.tokenExchangeProfiles!.create(
      tenantId,
      {
        name: "Imported",
        subject_token_type: "urn:acme:imported",
        type: "custom_authentication",
        action_id: "act_1",
      },
      {
        importMetadata: {
          id: "tep_imported",
          created_at: "2020-01-01T00:00:00.000Z",
          updated_at: "2021-01-01T00:00:00.000Z",
        },
      },
    );
    expect(created.id).toBe("tep_imported");
    const fetched = await data.tokenExchangeProfiles!.get(
      tenantId,
      "tep_imported",
    );
    expect(fetched!.created_at).toBe("2020-01-01T00:00:00.000Z");
    expect(fetched!.updated_at).toBe("2021-01-01T00:00:00.000Z");
  });

  it("lists oldest first, then by id", async () => {
    const adapter = data.tokenExchangeProfiles!;
    const seed = async (id: string, created_at: string) =>
      adapter.create(
        tenantId,
        {
          name: id,
          subject_token_type: `urn:acme:${id}`,
          type: "custom_authentication",
          action_id: "act_1",
        },
        { importMetadata: { id, created_at, updated_at: created_at } },
      );
    await seed("tep_c", "2024-01-02T00:00:00.000Z");
    await seed("tep_b", "2024-01-01T00:00:00.000Z");
    await seed("tep_a", "2024-01-02T00:00:00.000Z");

    expect((await adapter.list(tenantId)).map((p) => p.id)).toEqual([
      "tep_b",
      "tep_a",
      "tep_c",
    ]);
  });

  it("isolates tenants", async () => {
    const adapter = data.tokenExchangeProfiles!;
    const created = await adapter.create(tenantId, {
      name: "Tenant A",
      subject_token_type: "urn:acme:token",
      type: "custom_authentication",
      action_id: "act_1",
    });

    expect(await adapter.get(otherTenant, created.id)).toBeNull();
    expect(await adapter.list(otherTenant)).toEqual([]);
    expect(await adapter.update(otherTenant, created.id, { name: "x" })).toBe(
      false,
    );
    expect(await adapter.remove(otherTenant, created.id)).toBe(false);

    // The same subject_token_type is free in another tenant.
    await adapter.create(otherTenant, {
      name: "Tenant B",
      subject_token_type: "urn:acme:token",
      type: "custom_authentication",
      action_id: "act_2",
    });
    expect(await adapter.list(otherTenant)).toHaveLength(1);
    expect((await adapter.get(tenantId, created.id))!.name).toBe("Tenant A");
  });

  it("rejects a duplicate subject_token_type within a tenant", async () => {
    const adapter = data.tokenExchangeProfiles!;
    const input = {
      name: "First",
      subject_token_type: "urn:acme:dup",
      type: "custom_authentication" as const,
      action_id: "act_1",
    };
    const first = await adapter.create(tenantId, input);
    await expect(
      adapter.create(tenantId, { ...input, name: "Second" }),
    ).rejects.toThrow();

    const second = await adapter.create(tenantId, {
      ...input,
      subject_token_type: "urn:acme:other",
    });
    await expect(
      adapter.update(tenantId, second.id, {
        subject_token_type: "urn:acme:dup",
      }),
    ).rejects.toThrow();
    expect((await adapter.list(tenantId)).map((p) => p.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it("round-trips the client token_exchange field", async () => {
    const created = await data.clients.create(tenantId, {
      client_id: "client-te",
      name: "Token exchange client",
      token_exchange: { allow_any_profile_of_type: ["custom_authentication"] },
    });
    expect(created.token_exchange).toEqual({
      allow_any_profile_of_type: ["custom_authentication"],
    });

    const fetched = await data.clients.get(tenantId, "client-te");
    expect(fetched!.token_exchange).toEqual({
      allow_any_profile_of_type: ["custom_authentication"],
    });
    const byClientId = await data.clients.getByClientId("client-te");
    expect(byClientId!.token_exchange).toEqual({
      allow_any_profile_of_type: ["custom_authentication"],
    });
    const { clients } = await data.clients.list(tenantId);
    expect(
      clients.find((c) => c.client_id === "client-te")!.token_exchange,
    ).toEqual({ allow_any_profile_of_type: ["custom_authentication"] });

    await data.clients.update(tenantId, "client-te", {
      token_exchange: { allow_any_profile_of_type: [] },
    });
    expect(
      (await data.clients.get(tenantId, "client-te"))!.token_exchange,
    ).toEqual({ allow_any_profile_of_type: [] });

    await data.clients.create(tenantId, { client_id: "plain", name: "Plain" });
    expect(
      (await data.clients.get(tenantId, "plain"))!.token_exchange
        ?.allow_any_profile_of_type,
    ).toBeUndefined();
  });
});
