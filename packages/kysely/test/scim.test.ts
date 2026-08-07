import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "./helpers/test-server";

describe("SCIM adapters", () => {
  let data: Awaited<ReturnType<typeof getTestServer>>["data"];
  const tenantId = "test-tenant";
  const otherTenant = "other-tenant";
  const connectionId = "con_123";

  beforeEach(async () => {
    const server = await getTestServer();
    data = server.data;
  });

  describe("scimConfigurations", () => {
    it("creates, gets, updates and removes", async () => {
      const created = await data.scimConfigurations!.create(tenantId, {
        connection_id: connectionId,
        user_id_attribute: "externalId",
        mapping: [{ scim: "userName", auth0: "email" }],
      });
      expect(created.mapping).toEqual([{ scim: "userName", auth0: "email" }]);

      const fetched = await data.scimConfigurations!.get(
        tenantId,
        connectionId,
      );
      expect(fetched!.mapping).toEqual([{ scim: "userName", auth0: "email" }]);

      expect(
        await data.scimConfigurations!.get(otherTenant, connectionId),
      ).toBeNull();

      expect(
        await data.scimConfigurations!.update(tenantId, connectionId, {
          user_id_attribute: "userName",
          mapping: [{ scim: "name.givenName", auth0: "given_name" }],
        }),
      ).toBe(true);
      const updated = await data.scimConfigurations!.get(
        tenantId,
        connectionId,
      );
      expect(updated!.user_id_attribute).toBe("userName");
      expect(updated!.mapping).toEqual([
        { scim: "name.givenName", auth0: "given_name" },
      ]);

      expect(
        await data.scimConfigurations!.update(tenantId, "nope", {
          mapping: [],
        }),
      ).toBe(false);

      expect(
        await data.scimConfigurations!.remove(tenantId, connectionId),
      ).toBe(true);
      expect(
        await data.scimConfigurations!.get(tenantId, connectionId),
      ).toBeNull();
    });
  });

  describe("scimTokens", () => {
    it("creates, resolves by id/hash, lists, marks used, removes", async () => {
      await data.scimTokens!.create(tenantId, {
        token_id: "tok_1",
        connection_id: connectionId,
        token_hash: "hash_abc",
        scopes: ["read:users"],
      });
      await data.scimTokens!.create(tenantId, {
        token_id: "tok_2",
        connection_id: connectionId,
        token_hash: "hash_def",
        scopes: [],
      });
      await data.scimTokens!.create(tenantId, {
        token_id: "tok_3",
        connection_id: "con_other",
        token_hash: "hash_ghi",
        scopes: [],
      });

      expect((await data.scimTokens!.get(tenantId, "tok_1"))!.scopes).toEqual([
        "read:users",
      ]);
      expect(
        (await data.scimTokens!.getByHash(tenantId, "hash_abc"))!.token_id,
      ).toBe("tok_1");
      expect(
        await data.scimTokens!.getByHash(otherTenant, "hash_abc"),
      ).toBeNull();

      const list = await data.scimTokens!.listByConnection(
        tenantId,
        connectionId,
      );
      expect(list.map((t) => t.token_id).sort()).toEqual(["tok_1", "tok_2"]);

      const usedAt = new Date().toISOString();
      expect(await data.scimTokens!.markUsed(tenantId, "tok_1", usedAt)).toBe(
        true,
      );
      expect(
        (await data.scimTokens!.get(tenantId, "tok_1"))!.last_used_at,
      ).toBe(usedAt);

      expect(await data.scimTokens!.remove(tenantId, "tok_1")).toBe(true);
      expect(await data.scimTokens!.get(tenantId, "tok_1")).toBeNull();
    });
  });

  describe("scimExternalIds", () => {
    it("creates, looks up both ways, scopes by connection, removes", async () => {
      await data.scimExternalIds!.create(tenantId, {
        connection_id: connectionId,
        external_id: "ext-1",
        user_id: "auth0|1",
      });

      expect(
        (await data.scimExternalIds!.getByExternalId(
          tenantId,
          connectionId,
          "ext-1",
        ))!.user_id,
      ).toBe("auth0|1");
      expect(
        (await data.scimExternalIds!.getByUserId(
          tenantId,
          connectionId,
          "auth0|1",
        ))!.external_id,
      ).toBe("ext-1");
      expect(
        await data.scimExternalIds!.getByExternalId(
          tenantId,
          "con_other",
          "ext-1",
        ),
      ).toBeNull();

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
