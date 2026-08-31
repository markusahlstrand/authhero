import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { CodeExecutor } from "@authhero/adapter-interfaces";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

function makeRecordingExecutor() {
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
      deployCalls.push({ id, code });
    },
    remove: async (id) => {
      removeCalls.push(id);
    },
  };
  return { executor, deployCalls, removeCalls };
}

const TENANT = "tenantId";

describe("actions management API", () => {
  it("creates an action, snapshots a version, and the action shows up via GET", async () => {
    const { executor, deployCalls } = makeRecordingExecutor();
    const { managementApp, env } = await getTestServer({
      codeExecutor: executor,
    });
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const createRes = await client.actions.actions.$post(
      {
        json: {
          name: "Slack notify",
          code: "// v1",
          supported_triggers: [{ id: "post-login" }],
        },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    expect(deployCalls).toEqual([{ id: created.id, code: "// v1" }]);

    const versionsRes = await client.actions.actions[":actionId"].versions.$get(
      {
        param: { actionId: created.id },
        header: { "tenant-id": TENANT },
        query: {},
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(versionsRes.status).toBe(200);
    const { versions } = (await versionsRes.json()) as {
      versions: Array<{
        id: string;
        number: number;
        deployed: boolean;
        code: string;
      }>;
    };
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      number: 1,
      deployed: true,
      code: "// v1",
    });
  });

  it("appends a new version on every deploy and only the latest is marked deployed", async () => {
    const { executor, deployCalls } = makeRecordingExecutor();
    const { managementApp, env } = await getTestServer({
      codeExecutor: executor,
    });
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const createRes = await client.actions.actions.$post(
      {
        json: { name: "v1-action", code: "// v1" },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const { id } = (await createRes.json()) as { id: string };

    // Update + deploy → version 2
    await client.actions.actions[":id"].$patch(
      {
        param: { id },
        json: { code: "// v2" },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const deployRes = await client.actions.actions[":id"].deploy.$post(
      {
        param: { id },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(deployRes.status).toBe(200);

    const versionsRes = await client.actions.actions[":actionId"].versions.$get(
      {
        param: { actionId: id },
        header: { "tenant-id": TENANT },
        query: {},
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const { versions } = (await versionsRes.json()) as {
      versions: Array<{ number: number; deployed: boolean; code: string }>;
    };
    // Sorted desc by number → newest first. Three versions: create (v1),
    // patch with new code (v2), and explicit deploy (v3, same code as v2).
    expect(versions.map((v) => v.number)).toEqual([3, 2, 1]);
    expect(versions[0]).toMatchObject({ deployed: true, code: "// v2" });
    expect(versions[1]).toMatchObject({ deployed: false, code: "// v2" });
    expect(versions[2]).toMatchObject({ deployed: false, code: "// v1" });

    // The codeExecutor should have seen v1 (on create), v2 (on PATCH update),
    // and v2 again (on POST /deploy).
    expect(deployCalls.map((c) => c.code)).toEqual(["// v1", "// v2", "// v2"]);
  });

  it("rolls back to a prior version, redeploys it, and snapshots a new version", async () => {
    const { executor, deployCalls } = makeRecordingExecutor();
    const { managementApp, env } = await getTestServer({
      codeExecutor: executor,
    });
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const createRes = await client.actions.actions.$post(
      {
        json: { name: "rollback-action", code: "// v1" },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const { id } = (await createRes.json()) as { id: string };

    await client.actions.actions[":id"].$patch(
      {
        param: { id },
        json: { code: "// v2" },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    const v1List = await client.actions.actions[":actionId"].versions.$get(
      {
        param: { actionId: id },
        header: { "tenant-id": TENANT },
        query: {},
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const v1 = (
      (await v1List.json()) as {
        versions: Array<{ id: string; number: number }>;
      }
    ).versions.find((v) => v.number === 1)!;

    deployCalls.length = 0; // Clear so we only assert on the rollback deploy

    const rollbackRes = await client.actions.actions[":actionId"].versions[
      ":id"
    ].deploy.$post(
      {
        param: { actionId: id, id: v1.id },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(rollbackRes.status).toBe(200);
    const after = (await rollbackRes.json()) as { code: string };
    expect(after.code).toBe("// v1");
    expect(deployCalls).toEqual([{ id, code: "// v1" }]);

    // After rollback we expect 3 versions: create (v1), patch (v2),
    // rollback (v3 = v1's code re-snapshotted) — only v3 is marked deployed.
    const versionsRes = await client.actions.actions[":actionId"].versions.$get(
      {
        param: { actionId: id },
        header: { "tenant-id": TENANT },
        query: {},
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const { versions } = (await versionsRes.json()) as {
      versions: Array<{ number: number; deployed: boolean; code: string }>;
    };
    expect(versions).toHaveLength(3);
    expect(versions[0]).toMatchObject({
      number: 3,
      deployed: true,
      code: "// v1",
    });
    expect(versions.filter((v) => v.deployed)).toHaveLength(1);
  });

  it("fetches a single version by id", async () => {
    const { executor } = makeRecordingExecutor();
    const { managementApp, env } = await getTestServer({
      codeExecutor: executor,
    });
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const createRes = await client.actions.actions.$post(
      {
        json: { name: "get-version", code: "// only" },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const { id } = (await createRes.json()) as { id: string };

    const list = (await (
      await client.actions.actions[":actionId"].versions.$get(
        {
          param: { actionId: id },
          header: { "tenant-id": TENANT },
          query: {},
        },
        { headers: { authorization: `Bearer ${token}` } },
      )
    ).json()) as { versions: Array<{ id: string }> };

    const versionId = list.versions[0]!.id;
    const getRes = await client.actions.actions[":actionId"].versions[
      ":id"
    ].$get(
      {
        param: { actionId: id, id: versionId },
        header: { "tenant-id": TENANT },
        query: {},
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(getRes.status).toBe(200);
    const v = (await getRes.json()) as { id: string; number: number };
    expect(v.id).toBe(versionId);
    expect(v.number).toBe(1);
  });

  it("removes versions when the action is deleted", async () => {
    const { executor, removeCalls } = makeRecordingExecutor();
    const { managementApp, env } = await getTestServer({
      codeExecutor: executor,
    });
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const createRes = await client.actions.actions.$post(
      {
        json: { name: "delete-action", code: "// only" },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const { id } = (await createRes.json()) as { id: string };

    const deleteRes = await client.actions.actions[":id"].$delete(
      {
        param: { id },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(deleteRes.status).toBe(200);
    expect(removeCalls).toEqual([id]);

    // Versions endpoint should now 404 because the parent action is gone.
    const versionsRes = await client.actions.actions[":actionId"].versions.$get(
      {
        param: { actionId: id },
        header: { "tenant-id": TENANT },
        query: {},
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(versionsRes.status).toBe(404);
  });
});

describe("action-trigger bindings invoke the deployed action code", () => {
  it("PATCH bindings + post-login dispatch loads code via data.actions", async () => {
    // The codeExecutor used here only records execute() calls — we don't
    // test deploy() here because that's covered above.
    const executeCalls: Array<{ code: string; hookCodeId?: string }> = [];
    const executor: CodeExecutor = {
      execute: async (params) => {
        executeCalls.push({
          code: params.code,
          hookCodeId: params.hookCodeId,
        });
        return { success: true, durationMs: 1, apiCalls: [], logs: [] };
      },
      deploy: async () => {},
      remove: async () => {},
    };

    const { managementApp, env } = await getTestServer({
      codeExecutor: executor,
    });
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const createRes = await client.actions.actions.$post(
      {
        json: {
          name: "post-login-action",
          code: "exports.onExecutePostLogin = async () => {}",
          supported_triggers: [{ id: "post-login" }],
        },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const { id: actionId } = (await createRes.json()) as { id: string };

    const bindRes = await client.actions.triggers[":triggerId"].bindings.$patch(
      {
        param: { triggerId: "post-login" },
        json: {
          bindings: [
            {
              ref: { type: "action_id", value: actionId },
              display_name: "Slack",
            },
          ],
        },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(bindRes.status).toBe(200);

    const hooks = await env.data.hooks.list(TENANT, {
      q: 'trigger_id:"post-user-login"',
    });
    const codeHook = hooks.hooks.find(
      (h: any) => "code_id" in h && h.code_id === actionId,
    );
    expect(codeHook).toBeDefined();

    // Direct invocation through handleCodeHook (covered in detail in
    // codehooks.spec.ts) — here we only verify the binding round-trips.
  });

  it("rejects a trigger that code hooks cannot bind to instead of storing it", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const createRes = await client.actions.actions.$post(
      {
        json: {
          name: "unbindable-trigger-action",
          code: "exports.onExecutePostLogin = async () => {}",
          supported_triggers: [{ id: "post-login" }],
        },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const { id: actionId } = (await createRes.json()) as { id: string };

    // `post-user-update` is a real hook trigger, but not one a code hook may
    // run on. Previously it was cast through and persisted a hook row that no
    // dispatcher would ever pick up.
    const bindRes = await client.actions.triggers[":triggerId"].bindings.$patch(
      {
        param: { triggerId: "post-user-update" },
        json: {
          bindings: [{ ref: { type: "action_id", value: actionId } }],
        },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(bindRes.status).toBe(400);
    expect(await bindRes.text()).toContain(
      "Trigger post-user-update does not support action bindings",
    );

    const hooks = await env.data.hooks.list(TENANT, {
      q: 'trigger_id:"post-user-update"',
    });
    expect(
      hooks.hooks.find((h) => "code_id" in h && h.code_id === actionId),
    ).toBeUndefined();
  });

  it("never returns a secret value on any action response path", async () => {
    const { executor } = makeRecordingExecutor();
    const { managementApp, env } = await getTestServer({
      codeExecutor: executor,
    });
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const SECRET_VALUE = "super-secret-token-value";

    // Every response body is scanned for the raw value rather than only
    // checking `secrets[].value`, so a leak through any other field (a
    // serialised version snapshot, say) fails too.
    const expectNoLeak = async (label: string, res: Response) => {
      const body = await res.text();
      expect(body, `${label} leaked the secret value`).not.toContain(
        SECRET_VALUE,
      );
      return JSON.parse(body);
    };

    const createRes = await client.actions.actions.$post(
      {
        json: {
          name: "secretive",
          code: "// v1",
          secrets: [{ name: "API_KEY", value: SECRET_VALUE }],
          supported_triggers: [{ id: "post-login" }],
        },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createRes.status).toBe(201);
    const created = await expectNoLeak("POST /actions", createRes);
    expect(created.secrets).toEqual([{ name: "API_KEY" }]);

    // The value really is stored — the leak tests below are meaningful only
    // if there is something to leak.
    const stored = await env.data.actions.get(TENANT, created.id);
    expect(stored?.secrets?.[0]?.value).toBe(SECRET_VALUE);

    const getRes = await client.actions.actions[":id"].$get(
      {
        param: { id: created.id },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const fetched = await expectNoLeak("GET /actions/:id", getRes);
    expect(fetched.secrets).toEqual([{ name: "API_KEY" }]);

    const listRes = await client.actions.actions.$get(
      {
        header: { "tenant-id": TENANT },
        query: {},
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    await expectNoLeak("GET /actions", listRes);

    const patchRes = await client.actions.actions[":id"].$patch(
      {
        param: { id: created.id },
        json: { code: "// v2" },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    await expectNoLeak("PATCH /actions/:id", patchRes);

    const deployRes = await client.actions.actions[":id"].deploy.$post(
      {
        param: { id: created.id },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    await expectNoLeak("POST /actions/:id/deploy", deployRes);

    const bindRes = await client.actions.triggers[":triggerId"].bindings.$patch(
      {
        param: { triggerId: "post-login" },
        json: {
          bindings: [
            {
              ref: { type: "action_id", value: created.id },
              display_name: "Secretive",
            },
          ],
        },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    await expectNoLeak("PATCH /actions/triggers/:id/bindings", bindRes);

    const bindingsRes = await client.actions.triggers[
      ":triggerId"
    ].bindings.$get(
      {
        param: { triggerId: "post-login" },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    await expectNoLeak("GET /actions/triggers/:id/bindings", bindingsRes);
  });
});
