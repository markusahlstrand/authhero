import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

// Exercises the Lucene-style `q` filtering wired through buildLuceneFilter /
// sanitizeLuceneQuery, asserting feature parity with the kysely adapter:
// field:value, negation, _exists_, OR, quoted values, bare-string search,
// likeFields (substring) and the sanitize/whitelist tenant-boundary guard.
describe("adapter q filtering", () => {
  let data: ReturnType<typeof getTestServer>["data"];

  beforeEach(async () => {
    const server = getTestServer();
    data = server.data;
    await data.tenants.create({ id: "tenant1", name: "Test Tenant" });
    await data.tenants.create({ id: "tenant2", name: "Other Tenant" });
  });

  describe("users", () => {
    beforeEach(async () => {
      await data.users.create("tenant1", {
        user_id: "auth0|alice",
        email: "alice@example.com",
        name: "Alice",
        phone_number: "+15551234567",
        email_verified: true,
        is_social: false,
        provider: "auth0",
        login_count: 0,
      });
      await data.users.create("tenant1", {
        user_id: "auth0|bob",
        email: "bob@test.com",
        name: "Bob",
        email_verified: false,
        is_social: false,
        provider: "auth0",
        login_count: 0,
      });
      await data.users.create("tenant1", {
        user_id: "auth0|two",
        email: "two@example.com",
        name: "Two Words",
        email_verified: true,
        is_social: false,
        provider: "auth0",
        login_count: 0,
      });
    });

    it("matches field:value exactly", async () => {
      const res = await data.users.list("tenant1", {
        q: "email:alice@example.com",
      });
      expect(res.users.map((u) => u.user_id)).toEqual(["auth0|alice"]);
    });

    it("supports negation", async () => {
      const res = await data.users.list("tenant1", {
        q: "-email:alice@example.com",
      });
      const ids = res.users.map((u) => u.user_id).sort();
      expect(ids).toEqual(["auth0|bob", "auth0|two"]);
    });

    it("supports _exists_ / -_exists_", async () => {
      const withPhone = await data.users.list("tenant1", {
        q: "_exists_:phone_number",
      });
      expect(withPhone.users.map((u) => u.user_id)).toEqual(["auth0|alice"]);

      const withoutPhone = await data.users.list("tenant1", {
        q: "-_exists_:phone_number",
      });
      expect(withoutPhone.users.map((u) => u.user_id).sort()).toEqual([
        "auth0|bob",
        "auth0|two",
      ]);
    });

    it("supports OR queries", async () => {
      const res = await data.users.list("tenant1", {
        q: "email:alice@example.com OR email:bob@test.com",
      });
      expect(res.users.map((u) => u.user_id).sort()).toEqual([
        "auth0|alice",
        "auth0|bob",
      ]);
    });

    it("supports quoted values with spaces", async () => {
      const res = await data.users.list("tenant1", {
        q: 'name:"Two Words"',
      });
      expect(res.users.map((u) => u.user_id)).toEqual(["auth0|two"]);
    });

    it("supports bare-string search across searchable columns", async () => {
      const res = await data.users.list("tenant1", { q: "example.com" });
      expect(res.users.map((u) => u.user_id).sort()).toEqual([
        "auth0|alice",
        "auth0|two",
      ]);
    });

    it("strips non-whitelisted fields (no tenant crossing via q)", async () => {
      // `tenant_id` is not whitelisted, so the clause is dropped and the list
      // stays scoped to tenant1 rather than emitting SQL against tenant_id.
      const res = await data.users.list("tenant1", { q: "tenant_id:tenant2" });
      expect(res.users).toHaveLength(3);
    });
  });

  describe("logs (likeField: description)", () => {
    beforeEach(async () => {
      await data.logs.create("tenant1", {
        type: "s",
        description: "User logged in successfully",
      });
      await data.logs.create("tenant1", {
        type: "f",
        description: "Failed login attempt",
      });
    });

    it("matches description as a substring", async () => {
      const res = await data.logs.list("tenant1", { q: "description:logged" });
      expect(res.logs).toHaveLength(1);
      expect(res.logs[0].description).toBe("User logged in successfully");
    });

    it("matches type exactly", async () => {
      const res = await data.logs.list("tenant1", { q: "type:f" });
      expect(res.logs).toHaveLength(1);
      expect(res.logs[0].description).toBe("Failed login attempt");
    });
  });

  describe("resourceServers (likeFields: name, identifier)", () => {
    beforeEach(async () => {
      await data.resourceServers.create("tenant1", {
        name: "My API",
        identifier: "https://api.example.com",
      });
      await data.resourceServers.create("tenant1", {
        name: "Other Service",
        identifier: "https://other.example.org",
      });
    });

    it("matches name as a substring", async () => {
      const res = await data.resourceServers.list("tenant1", { q: "name:My" });
      expect(res.resource_servers).toHaveLength(1);
      expect(res.resource_servers[0].name).toBe("My API");
    });

    it("matches identifier as a substring", async () => {
      const res = await data.resourceServers.list("tenant1", {
        q: "identifier:other",
      });
      expect(res.resource_servers).toHaveLength(1);
      expect(res.resource_servers[0].name).toBe("Other Service");
    });
  });

  describe("organizations", () => {
    beforeEach(async () => {
      await data.organizations.create("tenant1", {
        name: "acme",
        display_name: "Acme Inc",
      });
      await data.organizations.create("tenant1", {
        name: "globex",
        display_name: "Globex",
      });
    });

    it("filters by name", async () => {
      const res = await data.organizations.list("tenant1", { q: "name:acme" });
      expect(res.organizations).toHaveLength(1);
      expect(res.organizations[0].name).toBe("acme");
    });

    it("strips non-whitelisted fields", async () => {
      const res = await data.organizations.list("tenant1", {
        q: "created_at:2020",
      });
      expect(res.organizations).toHaveLength(2);
    });
  });

  describe("previously-unfiltered entities now honor q", () => {
    it("codes filter by login_id and bare code_id", async () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      await data.codes.create("tenant1", {
        code_id: "code123",
        code_type: "otp",
        login_id: "login@example.com",
        expires_at: future,
      });
      await data.codes.create("tenant1", {
        code_id: "code456",
        code_type: "otp",
        login_id: "other@example.com",
        expires_at: future,
      });

      const byLogin = await data.codes.list("tenant1", {
        q: "login_id:login@example.com",
      });
      expect(byLogin.codes).toHaveLength(1);
      expect(byLogin.codes[0].code_id).toBe("code123");

      const byBare = await data.codes.list("tenant1", { q: "code123" });
      expect(byBare.codes).toHaveLength(1);
      expect(byBare.codes[0].code_id).toBe("code123");
    });

    it("flows filter by name", async () => {
      await data.flows.create("tenant1", { name: "FlowA", actions: [] });
      await data.flows.create("tenant1", { name: "FlowB", actions: [] });

      const res = await data.flows.list("tenant1", { q: "name:FlowA" });
      expect(res.flows).toHaveLength(1);
      expect(res.flows[0].name).toBe("FlowA");
    });

    it("forms filter by name", async () => {
      await data.forms.create("tenant1", { name: "FormA" });
      await data.forms.create("tenant1", { name: "FormB" });

      const res = await data.forms.list("tenant1", { q: "name:FormA" });
      expect(res.forms).toHaveLength(1);
      expect(res.forms[0].name).toBe("FormA");
    });

    it("keys filter by kid", async () => {
      await data.keys.create({ kid: "key1", type: "jwt_signing" } as any);
      await data.keys.create({ kid: "key2", type: "jwt_signing" } as any);

      const res = await data.keys.list({ q: "kid:key1" });
      expect(res.signingKeys).toHaveLength(1);
      expect(res.signingKeys[0].kid).toBe("key1");
    });
  });
});
