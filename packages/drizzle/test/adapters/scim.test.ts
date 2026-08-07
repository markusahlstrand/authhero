import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("SCIM adapters", () => {
  let data: ReturnType<typeof getTestServer>["data"];
  const tenantId = "test-tenant";
  const otherTenant = "other-tenant";
  const connectionId = "con_123";

  beforeEach(() => {
    data = getTestServer().data;
  });

  describe("scimConfigurations", () => {
    it("creates and gets a configuration", async () => {
      const created = await data.scimConfigurations!.create(tenantId, {
        connection_id: connectionId,
        user_id_attribute: "externalId",
        mapping: [{ scim: "userName", auth0: "email" }],
      });
      expect(created.connection_id).toBe(connectionId);
      expect(created.mapping).toEqual([{ scim: "userName", auth0: "email" }]);
      expect(created.created_at).toBeTruthy();

      const fetched = await data.scimConfigurations!.get(
        tenantId,
        connectionId,
      );
      expect(fetched).not.toBeNull();
      expect(fetched!.user_id_attribute).toBe("externalId");
      expect(fetched!.mapping).toEqual([{ scim: "userName", auth0: "email" }]);
    });

    it("is tenant-scoped on get", async () => {
      await data.scimConfigurations!.create(tenantId, {
        connection_id: connectionId,
        user_id_attribute: "externalId",
        mapping: [],
      });
      expect(
        await data.scimConfigurations!.get(otherTenant, connectionId),
      ).toBeNull();
    });

    it("updates mapping and user_id_attribute", async () => {
      await data.scimConfigurations!.create(tenantId, {
        connection_id: connectionId,
        user_id_attribute: "externalId",
        mapping: [],
      });
      const ok = await data.scimConfigurations!.update(tenantId, connectionId, {
        user_id_attribute: "userName",
        mapping: [{ scim: "name.givenName", auth0: "given_name" }],
      });
      expect(ok).toBe(true);

      const fetched = await data.scimConfigurations!.get(
        tenantId,
        connectionId,
      );
      expect(fetched!.user_id_attribute).toBe("userName");
      expect(fetched!.mapping).toEqual([
        { scim: "name.givenName", auth0: "given_name" },
      ]);
    });

    it("update/remove return false for missing rows", async () => {
      expect(
        await data.scimConfigurations!.update(tenantId, "nope", {
          mapping: [],
        }),
      ).toBe(false);
      expect(await data.scimConfigurations!.remove(tenantId, "nope")).toBe(
        false,
      );
    });

    it("removes a configuration", async () => {
      await data.scimConfigurations!.create(tenantId, {
        connection_id: connectionId,
        user_id_attribute: "externalId",
        mapping: [],
      });
      expect(
        await data.scimConfigurations!.remove(tenantId, connectionId),
      ).toBe(true);
      expect(
        await data.scimConfigurations!.get(tenantId, connectionId),
      ).toBeNull();
    });
  });

  describe("scimTokens", () => {
    it("creates, gets by id and by hash", async () => {
      const created = await data.scimTokens!.create(tenantId, {
        token_id: "tok_1",
        connection_id: connectionId,
        token_hash: "hash_abc",
        scopes: ["read:users", "write:users"],
      });
      expect(created.token_id).toBe("tok_1");
      expect(created.scopes).toEqual(["read:users", "write:users"]);
      expect(created.last_used_at).toBeUndefined();

      const byId = await data.scimTokens!.get(tenantId, "tok_1");
      expect(byId!.token_hash).toBe("hash_abc");

      const byHash = await data.scimTokens!.getByHash(tenantId, "hash_abc");
      expect(byHash!.token_id).toBe("tok_1");
    });

    it("does not leak tokens across tenants via hash", async () => {
      await data.scimTokens!.create(tenantId, {
        token_id: "tok_1",
        connection_id: connectionId,
        token_hash: "hash_abc",
        scopes: [],
      });
      expect(
        await data.scimTokens!.getByHash(otherTenant, "hash_abc"),
      ).toBeNull();
    });

    it("lists by connection and marks used", async () => {
      await data.scimTokens!.create(tenantId, {
        token_id: "tok_1",
        connection_id: connectionId,
        token_hash: "h1",
        scopes: [],
      });
      await data.scimTokens!.create(tenantId, {
        token_id: "tok_2",
        connection_id: connectionId,
        token_hash: "h2",
        scopes: [],
      });
      await data.scimTokens!.create(tenantId, {
        token_id: "tok_3",
        connection_id: "con_other",
        token_hash: "h3",
        scopes: [],
      });

      const list = await data.scimTokens!.listByConnection(
        tenantId,
        connectionId,
      );
      expect(list.map((t) => t.token_id).sort()).toEqual(["tok_1", "tok_2"]);

      const usedAt = new Date().toISOString();
      expect(await data.scimTokens!.markUsed(tenantId, "tok_1", usedAt)).toBe(
        true,
      );
      const fetched = await data.scimTokens!.get(tenantId, "tok_1");
      expect(fetched!.last_used_at).toBe(usedAt);
    });

    it("removes a token", async () => {
      await data.scimTokens!.create(tenantId, {
        token_id: "tok_1",
        connection_id: connectionId,
        token_hash: "h1",
        scopes: [],
      });
      expect(await data.scimTokens!.remove(tenantId, "tok_1")).toBe(true);
      expect(await data.scimTokens!.get(tenantId, "tok_1")).toBeNull();
    });
  });

  describe("scimExternalIds", () => {
    it("creates and looks up by external id and user id", async () => {
      await data.scimExternalIds!.create(tenantId, {
        connection_id: connectionId,
        external_id: "ext-1",
        user_id: "auth0|1",
      });

      const byExternal = await data.scimExternalIds!.getByExternalId(
        tenantId,
        connectionId,
        "ext-1",
      );
      expect(byExternal!.user_id).toBe("auth0|1");

      const byUser = await data.scimExternalIds!.getByUserId(
        tenantId,
        connectionId,
        "auth0|1",
      );
      expect(byUser!.external_id).toBe("ext-1");
    });

    it("scopes lookups to the connection", async () => {
      await data.scimExternalIds!.create(tenantId, {
        connection_id: connectionId,
        external_id: "ext-1",
        user_id: "auth0|1",
      });
      expect(
        await data.scimExternalIds!.getByExternalId(
          tenantId,
          "con_other",
          "ext-1",
        ),
      ).toBeNull();
    });

    it("removes a mapping", async () => {
      await data.scimExternalIds!.create(tenantId, {
        connection_id: connectionId,
        external_id: "ext-1",
        user_id: "auth0|1",
      });
      expect(
        await data.scimExternalIds!.remove(tenantId, connectionId, "auth0|1"),
      ).toBe(true);
      expect(
        await data.scimExternalIds!.getByUserId(
          tenantId,
          connectionId,
          "auth0|1",
        ),
      ).toBeNull();
    });
  });
});
