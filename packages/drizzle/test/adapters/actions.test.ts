import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("actions adapters", () => {
  let data: ReturnType<typeof getTestServer>["data"];

  beforeEach(async () => {
    const server = getTestServer();
    data = server.data;
    await data.tenants.create({ id: "tenant1", name: "Test Tenant" });
  });

  describe("actions", () => {
    it("creates and gets an action", async () => {
      const created = await data.actions.create("tenant1", {
        name: "My Action",
        code: "exports.onExecute = async () => {};",
        runtime: "node22",
        supported_triggers: [{ id: "post-login", version: "v3" }],
        dependencies: [{ name: "lodash", version: "4.17.21" }],
        secrets: [{ name: "API_KEY", value: "s3cr3t" }],
      });

      expect(created.id).toMatch(/^act_/);
      expect(created.status).toBe("built");
      // Create responses expose secret names only, not values.
      expect(created.secrets).toEqual([{ name: "API_KEY" }]);

      const fetched = await data.actions.get("tenant1", created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe("My Action");
      expect(fetched!.runtime).toBe("node22");
      expect(fetched!.supported_triggers).toEqual([
        { id: "post-login", version: "v3" },
      ]);
      expect(fetched!.is_system).toBe(false);
      expect(fetched!.inherit).toBe(false);
    });

    it("returns null for a missing action", async () => {
      expect(await data.actions.get("tenant1", "act_missing")).toBeNull();
    });

    it("lists actions and filters by name", async () => {
      await data.actions.create("tenant1", { name: "Alpha", code: "//a" });
      await data.actions.create("tenant1", { name: "Beta", code: "//b" });

      const all = await data.actions.list("tenant1", { include_totals: true });
      expect(all.actions).toHaveLength(2);
      expect(all.length).toBe(2);

      const filtered = await data.actions.list("tenant1", { q: "name:Alpha" });
      expect(filtered.actions.map((a) => a.name)).toEqual(["Alpha"]);
    });

    it("updates fields and status", async () => {
      const a = await data.actions.create("tenant1", {
        name: "Updatable",
        code: "//v1",
      });

      const ok = await data.actions.update("tenant1", a.id, {
        code: "//v2",
        status: "draft",
        deployed_at: "2026-01-01T00:00:00.000Z",
      });
      expect(ok).toBe(true);

      const fetched = await data.actions.get("tenant1", a.id);
      expect(fetched!.code).toBe("//v2");
      expect(fetched!.status).toBe("draft");
      expect(fetched!.deployed_at).toBe("2026-01-01T00:00:00.000Z");
    });

    it("merges secrets, preserving values when omitted", async () => {
      const a = await data.actions.create("tenant1", {
        name: "Secrets",
        code: "//s",
        secrets: [
          { name: "KEEP", value: "original" },
          { name: "REPLACE", value: "old" },
        ],
      });

      // KEEP omits value (should preserve), REPLACE supplies a new value.
      await data.actions.update("tenant1", a.id, {
        secrets: [{ name: "KEEP" }, { name: "REPLACE", value: "new" }],
      });

      const fetched = await data.actions.get("tenant1", a.id);
      const byName = Object.fromEntries(
        (fetched!.secrets ?? []).map((s) => [s.name, s.value]),
      );
      expect(byName).toEqual({ KEEP: "original", REPLACE: "new" });
    });

    it("removes an action", async () => {
      const a = await data.actions.create("tenant1", {
        name: "Doomed",
        code: "//d",
      });
      expect(await data.actions.remove("tenant1", a.id)).toBe(true);
      expect(await data.actions.get("tenant1", a.id)).toBeNull();
      expect(await data.actions.remove("tenant1", a.id)).toBe(false);
    });
  });

  describe("actionVersions", () => {
    it("assigns sequential numbers and clears prior deployed flag", async () => {
      const v1 = await data.actionVersions.create("tenant1", {
        action_id: "act_1",
        code: "//v1",
        deployed: true,
      });
      const v2 = await data.actionVersions.create("tenant1", {
        action_id: "act_1",
        code: "//v2",
        deployed: true,
      });

      expect(v1.number).toBe(1);
      expect(v2.number).toBe(2);

      // Creating v2 (deployed) clears the deployed flag on v1.
      const fetchedV1 = await data.actionVersions.get(
        "tenant1",
        "act_1",
        v1.id,
      );
      expect(fetchedV1!.deployed).toBe(false);
      const fetchedV2 = await data.actionVersions.get(
        "tenant1",
        "act_1",
        v2.id,
      );
      expect(fetchedV2!.deployed).toBe(true);
    });

    it("numbers are independent per action", async () => {
      const a1 = await data.actionVersions.create("tenant1", {
        action_id: "act_a",
        code: "//a",
      });
      const b1 = await data.actionVersions.create("tenant1", {
        action_id: "act_b",
        code: "//b",
      });
      expect(a1.number).toBe(1);
      expect(b1.number).toBe(1);
    });

    it("lists versions newest-first and removes all for an action", async () => {
      await data.actionVersions.create("tenant1", {
        action_id: "act_x",
        code: "//1",
      });
      await data.actionVersions.create("tenant1", {
        action_id: "act_x",
        code: "//2",
      });

      const list = await data.actionVersions.list("tenant1", "act_x", {
        include_totals: true,
      });
      expect(list.versions.map((v) => v.number)).toEqual([2, 1]);
      expect(list.length).toBe(2);

      const removed = await data.actionVersions.removeForAction(
        "tenant1",
        "act_x",
      );
      expect(removed).toBe(2);
      const after = await data.actionVersions.list("tenant1", "act_x");
      expect(after.versions).toHaveLength(0);
    });
  });

  describe("actionExecutions", () => {
    it("creates and gets an execution, round-tripping results and logs", async () => {
      const created = await data.actionExecutions.create("tenant1", {
        id: "exec_1",
        trigger_id: "post-login",
        status: "final",
        results: [
          {
            action_name: "My Action",
            error: null,
            started_at: "2026-01-01T00:00:00.000Z",
            ended_at: "2026-01-01T00:00:01.000Z",
          },
        ],
        logs: [
          {
            action_name: "My Action",
            lines: [{ level: "info", message: "ran" }],
          },
        ],
      });

      expect(created.id).toBe("exec_1");

      const fetched = await data.actionExecutions.get("tenant1", "exec_1");
      expect(fetched).not.toBeNull();
      expect(fetched!.status).toBe("final");
      expect(fetched!.results).toHaveLength(1);
      expect(fetched!.results[0].action_name).toBe("My Action");
      expect(fetched!.logs?.[0].lines[0].message).toBe("ran");
    });

    it("returns null for a missing execution", async () => {
      expect(await data.actionExecutions.get("tenant1", "nope")).toBeNull();
    });
  });
});
