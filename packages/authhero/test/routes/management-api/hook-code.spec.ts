import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { CodeExecutor } from "@authhero/adapter-interfaces";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { seedTenant } from "../../helpers/seed-tenant";

type HookCodeBody = {
  id: string;
  tenant_id: string;
  code: string;
  secrets?: Record<string, string>;
  created_at: string;
  updated_at: string;
  deploymentStatus?: "deployed" | "failed" | "not_required";
  deploymentError?: string;
};

function makeRecordingExecutor(options: { failDeploy?: boolean } = {}) {
  const deployCalls: Array<{ id: string; code: string }> = [];
  const removeCalls: string[] = [];
  const executor: CodeExecutor = {
    execute: async () => ({
      success: true,
      durationMs: 1,
      apiCalls: [],
      logs: [],
    }),
    deploy: async (id, code) => {
      if (options.failDeploy) {
        throw new Error("deploy exploded");
      }
      deployCalls.push({ id, code });
    },
    remove: async (id) => {
      removeCalls.push(id);
    },
  };
  return { executor, deployCalls, removeCalls };
}

describe("management-api hook-code", () => {
  async function setup(args: Parameters<typeof getTestServer>[0] = {}) {
    const { managementApp, env } = await getTestServer(args);
    return {
      env,
      managementClient: testClient(managementApp, env),
      token: await getAdminToken(),
    };
  }

  describe("POST /api/v2/hook-code", () => {
    it("creates hook code and reports not_required without a code executor", async () => {
      const { env, managementClient, token } = await setup();

      const response = await managementClient["hook-code"].$post(
        {
          json: {
            code: "export default async function () {}",
            secrets: { API_KEY: "secret" },
          },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(201);
      const body = (await response.json()) as HookCodeBody;
      expect(body).toMatchObject({
        tenant_id: "tenantId",
        code: "export default async function () {}",
        secrets: { API_KEY: "secret" },
        deploymentStatus: "not_required",
      });
      expect(body.id).toEqual(expect.any(String));
      expect(body.created_at).toEqual(expect.any(String));
      expect(body.updated_at).toEqual(expect.any(String));
      expect(body.deploymentError).toBeUndefined();

      const stored = await env.data.hookCode.get("tenantId", body.id);
      expect(stored?.code).toBe("export default async function () {}");
    });

    it("deploys through the code executor and reports deployed", async () => {
      const { executor, deployCalls } = makeRecordingExecutor();
      const { managementClient, token } = await setup({
        codeExecutor: executor,
      });

      const response = await managementClient["hook-code"].$post(
        {
          json: { code: "export default async function () {}" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(201);
      const body = (await response.json()) as HookCodeBody;
      expect(body.deploymentStatus).toBe("deployed");
      expect(deployCalls).toEqual([
        { id: body.id, code: "export default async function () {}" },
      ]);
    });

    it("still returns 201 with failed status when deployment throws", async () => {
      const { executor } = makeRecordingExecutor({ failDeploy: true });
      const { env, managementClient, token } = await setup({
        codeExecutor: executor,
      });

      const response = await managementClient["hook-code"].$post(
        {
          json: { code: "export default async function () {}" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(201);
      const body = (await response.json()) as HookCodeBody;
      expect(body.deploymentStatus).toBe("failed");
      expect(body.deploymentError).toBe("deploy exploded");
      // The row is persisted even though the deployment failed.
      expect(await env.data.hookCode.get("tenantId", body.id)).not.toBeNull();
    });

    it("rejects a body without code", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient["hook-code"].$post(
        {
          // @ts-expect-error - deliberately missing the required code field
          json: { secrets: {} },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/v2/hook-code/{id}", () => {
    it("returns the stored hook code", async () => {
      const { env, managementClient, token } = await setup();
      const created = await env.data.hookCode.create("tenantId", {
        code: "export default async function () {}",
        secrets: { TOKEN: "abc" },
      });

      const response = await managementClient["hook-code"][":id"].$get(
        {
          param: { id: created.id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as HookCodeBody;
      expect(body).toMatchObject({
        id: created.id,
        tenant_id: "tenantId",
        code: "export default async function () {}",
        secrets: { TOKEN: "abc" },
      });
    });

    it("returns 404 for an unknown id", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient["hook-code"][":id"].$get(
        {
          param: { id: "does-not-exist" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 when the hook code belongs to another tenant", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant");
      const created = await env.data.hookCode.create("otherTenant", {
        code: "export default async function () {}",
      });

      const response = await managementClient["hook-code"][":id"].$get(
        {
          param: { id: created.id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("PUT /api/v2/hook-code/{id}", () => {
    it("replaces the code and redeploys", async () => {
      const { executor, deployCalls } = makeRecordingExecutor();
      const { env, managementClient, token } = await setup({
        codeExecutor: executor,
      });
      const created = await env.data.hookCode.create("tenantId", {
        code: "v1",
        secrets: { A: "1" },
      });

      const response = await managementClient["hook-code"][":id"].$put(
        {
          param: { id: created.id },
          json: { code: "v2", secrets: { A: "2" } },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as HookCodeBody;
      expect(body).toMatchObject({
        id: created.id,
        code: "v2",
        secrets: { A: "2" },
        deploymentStatus: "deployed",
      });
      expect(deployCalls).toEqual([{ id: created.id, code: "v2" }]);

      const stored = await env.data.hookCode.get("tenantId", created.id);
      expect(stored?.code).toBe("v2");
      expect(stored?.secrets).toEqual({ A: "2" });
    });

    it("returns 404 for an unknown id", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient["hook-code"][":id"].$put(
        {
          param: { id: "does-not-exist" },
          json: { code: "v2" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 and leaves another tenant's hook code untouched", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant");
      const created = await env.data.hookCode.create("otherTenant", {
        code: "v1",
      });

      const response = await managementClient["hook-code"][":id"].$put(
        {
          param: { id: created.id },
          json: { code: "v2" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
      const stored = await env.data.hookCode.get("otherTenant", created.id);
      expect(stored?.code).toBe("v1");
    });
  });

  describe("DELETE /api/v2/hook-code/{id}", () => {
    it("removes the hook code and the deployed worker", async () => {
      const { executor, removeCalls } = makeRecordingExecutor();
      const { env, managementClient, token } = await setup({
        codeExecutor: executor,
      });
      const created = await env.data.hookCode.create("tenantId", {
        code: "v1",
      });

      const response = await managementClient["hook-code"][":id"].$delete(
        {
          param: { id: created.id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await env.data.hookCode.get("tenantId", created.id)).toBeNull();
      expect(removeCalls).toEqual([created.id]);
    });

    it("returns 404 for an unknown id", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient["hook-code"][":id"].$delete(
        {
          param: { id: "does-not-exist" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 and keeps another tenant's hook code", async () => {
      const { executor, removeCalls } = makeRecordingExecutor();
      const { env, managementClient, token } = await setup({
        codeExecutor: executor,
      });
      await seedTenant(env.data, "otherTenant");
      const created = await env.data.hookCode.create("otherTenant", {
        code: "v1",
      });

      const response = await managementClient["hook-code"][":id"].$delete(
        {
          param: { id: created.id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
      expect(
        await env.data.hookCode.get("otherTenant", created.id),
      ).not.toBeNull();
      expect(removeCalls).toEqual([]);
    });
  });
});
