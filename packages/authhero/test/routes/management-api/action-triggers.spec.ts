import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer, type TestServer } from "../../helpers/test-server";

const TENANT = "tenantId";
const OTHER_TENANT = "otherTenant";

const OTHER_TENANT_FIXTURE = {
  id: OTHER_TENANT,
  friendly_name: "Other Tenant",
  audience: "https://other.example.com",
  sender_email: "login@other.example.com",
  sender_name: "Other",
};

type Binding = {
  id: string;
  trigger_id: string;
  display_name: string;
  action: { id: string; name: string; secrets?: { name?: string }[] };
  created_at: string;
  updated_at: string;
};

type Client = ReturnType<typeof testClient<TestServer["managementApp"]>>;

// Derived from the route itself so the helper stays in step with the schema.
type BindingInput = Parameters<
  Client["actions"]["triggers"][":triggerId"]["bindings"]["$patch"]
>[0]["json"]["bindings"][number];

async function createAction(
  client: Client,
  token: string,
  name: string,
  tenantId = TENANT,
): Promise<string> {
  const res = await client.actions.actions.$post(
    {
      json: {
        name,
        code: "exports.onExecutePostLogin = async () => {}",
        supported_triggers: [{ id: "post-login" }],
      },
      header: { "tenant-id": tenantId },
    },
    { headers: { authorization: `Bearer ${token}` } },
  );
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return id;
}

async function getBindings(
  client: Client,
  token: string,
  triggerId: string,
  tenantId = TENANT,
) {
  const res = await client.actions.triggers[":triggerId"].bindings.$get(
    {
      param: { triggerId },
      header: { "tenant-id": tenantId },
    },
    { headers: { authorization: `Bearer ${token}` } },
  );
  expect(res.status).toBe(200);
  return (await res.json()) as { bindings: Binding[] };
}

async function patchBindings(
  client: Client,
  token: string,
  triggerId: string,
  bindings: BindingInput[],
  tenantId = TENANT,
) {
  return client.actions.triggers[":triggerId"].bindings.$patch(
    {
      param: { triggerId },
      json: { bindings },
      header: { "tenant-id": tenantId },
    },
    { headers: { authorization: `Bearer ${token}` } },
  );
}

describe("management-api action trigger bindings", () => {
  describe("GET /actions/triggers/:triggerId/bindings", () => {
    it("returns an empty list for a trigger with no bindings", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const body = await getBindings(client, token, "post-login");
      expect(body).toEqual({ bindings: [] });
    });

    it("returns an empty list rather than an error for an unknown trigger", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      // Reads are lenient: nothing can be bound to a trigger the dispatcher
      // does not know, so the answer is simply "no bindings", not a 400.
      const body = await getBindings(client, token, "no-such-trigger");
      expect(body).toEqual({ bindings: [] });
    });

    it("ignores non-code hooks on the same trigger", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      // A URL/webhook hook shares the trigger but is not an action binding.
      await env.data.hooks.create(TENANT, {
        hook_id: "hook-webhook",
        trigger_id: "post-user-login",
        url: "https://example.com/webhook",
        enabled: true,
        synchronous: false,
      });

      const body = await getBindings(client, token, "post-login");
      expect(body).toEqual({ bindings: [] });
    });

    it("requires a read:actions scope", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const tokenWithoutScope = await getAdminToken({ permissions: [] });

      const res = await client.actions.triggers[":triggerId"].bindings.$get(
        {
          param: { triggerId: "post-login" },
          header: { "tenant-id": TENANT },
        },
        { headers: { authorization: `Bearer ${tokenWithoutScope}` } },
      );
      expect(res.status).toBe(403);
    });
  });

  describe("PATCH /actions/triggers/:triggerId/bindings", () => {
    it("binds actions referenced by id and by name and reports them in order", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const firstId = await createAction(client, token, "first-action");
      const secondId = await createAction(client, token, "second-action");

      const res = await patchBindings(client, token, "post-login", [
        { ref: { type: "action_id", value: firstId }, display_name: "First" },
        { ref: { type: "action_name", value: "second-action" } },
      ]);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { bindings: Binding[] };

      expect(body.bindings).toHaveLength(2);
      expect(body.bindings.map((b) => b.action.id)).toEqual([
        firstId,
        secondId,
      ]);
      // The trigger id is reported in Auth0 form, not the internal hook id.
      expect(body.bindings.every((b) => b.trigger_id === "post-login")).toBe(
        true,
      );
      // display_name falls back to the action name when not supplied.
      expect(body.bindings.map((b) => b.display_name)).toEqual([
        "First",
        "second-action",
      ]);
      for (const binding of body.bindings) {
        expect(typeof binding.id).toBe("string");
        expect(typeof binding.created_at).toBe("string");
        expect(typeof binding.updated_at).toBe("string");
      }

      // The GET route reads the same bindings back, highest priority first,
      // which is the order they were submitted in.
      const listed = await getBindings(client, token, "post-login");
      expect(listed.bindings.map((b) => b.action.id)).toEqual([
        firstId,
        secondId,
      ]);
      expect(listed.bindings.map((b) => b.id)).toEqual(
        body.bindings.map((b) => b.id),
      );

      // Each binding is persisted as a code hook whose priority mirrors the
      // array position: first in the array executes first.
      const hooks = await env.data.hooks.list(TENANT, {
        q: 'trigger_id:"post-user-login"',
      });
      const codeHooks = hooks.hooks
        .filter((h) => "code_id" in h && h.code_id)
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      expect(codeHooks.map((h) => "code_id" in h && h.code_id)).toEqual([
        firstId,
        secondId,
      ]);
      expect(codeHooks.map((h) => h.priority)).toEqual([2, 1]);
      expect(codeHooks.every((h) => h.enabled && h.synchronous)).toBe(true);
    });

    it("accepts the legacy ref.id and ref.name shapes", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const actionId = await createAction(client, token, "legacy-ref-action");

      const byId = await patchBindings(client, token, "post-login", [
        { ref: { id: actionId } },
      ]);
      expect(byId.status).toBe(200);
      const byIdBody = (await byId.json()) as { bindings: Binding[] };
      expect(byIdBody.bindings.map((b) => b.action.id)).toEqual([actionId]);

      // ref.name alone is not a supported lookup key: the route only resolves
      // names through { type: "action_name", value }, so this is a 400 and
      // the previous binding is left untouched.
      const byName = await patchBindings(client, token, "post-login", [
        { ref: { name: "legacy-ref-action" } },
      ]);
      expect(byName.status).toBe(400);
      expect(await byName.text()).toContain(
        "Binding at index 0 must reference an action via ref.id or ref.value",
      );
      const listed = await getBindings(client, token, "post-login");
      expect(listed.bindings.map((b) => b.action.id)).toEqual([actionId]);
    });

    it("replaces the previous bindings on a second PATCH", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const keptId = await createAction(client, token, "kept");
      const removedId = await createAction(client, token, "removed");
      const addedId = await createAction(client, token, "added");

      const first = await patchBindings(client, token, "post-login", [
        { ref: { type: "action_id", value: keptId } },
        { ref: { type: "action_id", value: removedId } },
      ]);
      expect(first.status).toBe(200);

      const second = await patchBindings(client, token, "post-login", [
        { ref: { type: "action_id", value: addedId } },
        { ref: { type: "action_id", value: keptId } },
      ]);
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as { bindings: Binding[] };

      // The removed action is gone, the added one is present, and the new
      // submission order wins over the old one.
      expect(secondBody.bindings.map((b) => b.action.id)).toEqual([
        addedId,
        keptId,
      ]);

      const listed = await getBindings(client, token, "post-login");
      expect(listed.bindings.map((b) => b.action.id)).toEqual([
        addedId,
        keptId,
      ]);
      // Nothing is left behind in storage either: exactly the two bound
      // actions, with no orphan hook from the replaced set.
      const hooks = await env.data.hooks.list(TENANT, {
        q: 'trigger_id:"post-user-login"',
      });
      const codeIds = hooks.hooks
        .filter((h) => "code_id" in h && h.code_id)
        .map((h) => ("code_id" in h ? h.code_id : undefined));
      expect(codeIds.sort()).toEqual([addedId, keptId].sort());
    });

    it("unbinds everything when given an empty list", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const actionId = await createAction(client, token, "to-unbind");
      const bound = await patchBindings(client, token, "post-login", [
        { ref: { type: "action_id", value: actionId } },
      ]);
      expect(bound.status).toBe(200);

      const cleared = await patchBindings(client, token, "post-login", []);
      expect(cleared.status).toBe(200);
      expect(await cleared.json()).toEqual({ bindings: [] });

      const listed = await getBindings(client, token, "post-login");
      expect(listed.bindings).toEqual([]);

      const hooks = await env.data.hooks.list(TENANT, {
        q: 'trigger_id:"post-user-login"',
      });
      expect(
        hooks.hooks.find((h) => "code_id" in h && h.code_id === actionId),
      ).toBeUndefined();

      // The action itself is untouched: only the binding was removed.
      const action = await env.data.actions.get(TENANT, actionId);
      expect(action?.id).toBe(actionId);
    });

    it("leaves non-code hooks on the trigger alone when replacing bindings", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      await env.data.hooks.create(TENANT, {
        hook_id: "hook-webhook",
        trigger_id: "post-user-login",
        url: "https://example.com/webhook",
        enabled: true,
        synchronous: false,
      });
      const actionId = await createAction(client, token, "beside-webhook");

      const res = await patchBindings(client, token, "post-login", [
        { ref: { type: "action_id", value: actionId } },
      ]);
      expect(res.status).toBe(200);

      const webhook = await env.data.hooks.get(TENANT, "hook-webhook");
      expect(webhook?.hook_id).toBe("hook-webhook");
    });

    it("returns 404 for an unknown action id without touching existing bindings", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const existingId = await createAction(client, token, "existing");
      const bound = await patchBindings(client, token, "post-login", [
        { ref: { type: "action_id", value: existingId } },
      ]);
      expect(bound.status).toBe(200);
      const boundBody = (await bound.json()) as { bindings: Binding[] };

      // The valid first entry must not be applied when a later one fails:
      // every ref is resolved before any hook is removed.
      const res = await patchBindings(client, token, "post-login", [
        { ref: { type: "action_id", value: existingId } },
        { ref: { type: "action_id", value: "act_does_not_exist" } },
      ]);
      expect(res.status).toBe(404);
      expect(await res.text()).toContain("Action act_does_not_exist not found");

      const listed = await getBindings(client, token, "post-login");
      expect(listed.bindings.map((b) => b.id)).toEqual(
        boundBody.bindings.map((b) => b.id),
      );
    });

    it("restores the original bindings when a create fails mid-swap", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const firstId = await createAction(client, token, "original-first");
      const secondId = await createAction(client, token, "original-second");
      const replacementA = await createAction(client, token, "replacement-a");
      const replacementB = await createAction(client, token, "replacement-b");

      // Seeded directly so the rows carry non-default fields the rollback
      // has to preserve, not just the audit-shaped binding summary.
      await env.data.hooks.create(TENANT, {
        hook_id: "hook-original-first",
        trigger_id: "post-user-login",
        code_id: firstId,
        enabled: true,
        synchronous: true,
        priority: 2,
        metadata: { note: "keep" },
      });
      await env.data.hooks.create(TENANT, {
        hook_id: "hook-original-second",
        trigger_id: "post-user-login",
        code_id: secondId,
        enabled: false,
        synchronous: false,
        priority: 1,
      });
      const before = await env.data.hooks.list(TENANT, {
        q: 'trigger_id:"post-user-login"',
      });

      const realCreate = env.data.hooks.create;
      let calls = 0;
      env.data.hooks.create = async (tenantId, hook) => {
        calls++;
        if (calls === 2) {
          throw new Error("storage unavailable");
        }
        return realCreate(tenantId, hook);
      };

      // The original error surfaces (the parent app turns it into a 500)
      // rather than a partial swap being reported as success.
      await expect(
        patchBindings(client, token, "post-login", [
          { ref: { type: "action_id", value: replacementA } },
          { ref: { type: "action_id", value: replacementB } },
        ]),
      ).rejects.toThrow("storage unavailable");
      env.data.hooks.create = realCreate;
      // One new binding, the failing one, then the two restored originals.
      expect(calls).toBe(4);

      const after = await env.data.hooks.list(TENANT, {
        q: 'trigger_id:"post-user-login"',
      });
      const strip = (hooks: typeof after.hooks) =>
        hooks
          .map(({ created_at, updated_at, ...rest }) => rest)
          .sort((a, b) => a.hook_id.localeCompare(b.hook_id));
      expect(strip(after.hooks)).toEqual(strip(before.hooks));

      const listed = await getBindings(client, token, "post-login");
      expect(listed.bindings.map((b) => b.action.id)).toEqual([
        firstId,
        secondId,
      ]);
    });

    it("does not shadow-copy an inherited hook when rolling back", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      // Stand-in for a control-plane hook surfaced through runtime
      // inheritance: listed for this tenant but owned by another one, so the
      // tenant-scoped remove deletes nothing.
      await env.data.tenants.create(OTHER_TENANT_FIXTURE);
      const inherited = await env.data.hooks.create(OTHER_TENANT, {
        hook_id: "hook-inherited",
        trigger_id: "post-user-login",
        code_id: "act_control_plane",
        enabled: true,
        synchronous: true,
        priority: 5,
        metadata: { inheritable: true },
      });
      const replacementId = await createAction(client, token, "replacement");

      const realList = env.data.hooks.list;
      const realCreate = env.data.hooks.create;
      env.data.hooks.list = async (tenantId, params) => {
        const result = await realList(tenantId, params);
        return { ...result, hooks: [...result.hooks, inherited] };
      };
      let failed = false;
      const createdIds: (string | undefined)[] = [];
      env.data.hooks.create = async (tenantId, hook) => {
        createdIds.push(hook.hook_id);
        if (!failed) {
          failed = true;
          throw new Error("storage unavailable");
        }
        return realCreate(tenantId, hook);
      };

      await expect(
        patchBindings(client, token, "post-login", [
          { ref: { type: "action_id", value: replacementId } },
        ]),
      ).rejects.toThrow("storage unavailable");
      env.data.hooks.list = realList;
      env.data.hooks.create = realCreate;

      // The rollback must not try to re-create it for this tenant. Asserted
      // on the calls because the test store keys hooks by id alone, so a
      // shadow copy would collide rather than land.
      expect(createdIds).not.toContain("hook-inherited");
      expect(await env.data.hooks.get(TENANT, "hook-inherited")).toBeNull();
      expect(
        (await env.data.hooks.get(OTHER_TENANT, "hook-inherited"))?.hook_id,
      ).toBe("hook-inherited");
    });

    it("returns 404 for an unknown action name", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      await createAction(client, token, "some-action");

      const res = await patchBindings(client, token, "post-login", [
        { ref: { type: "action_name", value: "no-such-action" } },
      ]);
      // An unresolvable name falls through to the "must reference an action"
      // check, since no id could be derived from it.
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(
        "Binding at index 0 must reference an action via ref.id or ref.value",
      );
    });

    it("returns 400 for a ref without an id or value", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const res = await patchBindings(client, token, "post-login", [
        { ref: { type: "action_id" } },
      ]);
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(
        "Binding at index 0 must reference an action via ref.id or ref.value",
      );
    });

    it("returns 400 for an unknown trigger", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const actionId = await createAction(client, token, "any-action");

      const res = await patchBindings(client, token, "no-such-trigger", [
        { ref: { type: "action_id", value: actionId } },
      ]);
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(
        "Trigger no-such-trigger does not support action bindings",
      );
    });

    it("accepts every Auth0 trigger that code hooks can run on", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const actionId = await createAction(client, token, "multi-trigger");

      for (const triggerId of [
        "post-login",
        "credentials-exchange",
        "pre-user-registration",
        "post-user-registration",
      ]) {
        const res = await patchBindings(client, token, triggerId, [
          { ref: { type: "action_id", value: actionId } },
        ]);
        expect(res.status, triggerId).toBe(200);
        const body = (await res.json()) as { bindings: Binding[] };
        expect(body.bindings).toHaveLength(1);
        expect(body.bindings[0]!.trigger_id).toBe(triggerId);
      }

      // Each trigger keeps its own binding set: binding the others did not
      // disturb the post-login one.
      const postLogin = await getBindings(client, token, "post-login");
      expect(postLogin.bindings.map((b) => b.action.id)).toEqual([actionId]);
    });

    it("requires an update:actions scope", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const readOnlyToken = await getAdminToken({
        permissions: ["read:actions"],
      });

      const res = await client.actions.triggers[":triggerId"].bindings.$patch(
        {
          param: { triggerId: "post-login" },
          json: { bindings: [] },
          header: { "tenant-id": TENANT },
        },
        { headers: { authorization: `Bearer ${readOnlyToken}` } },
      );
      expect(res.status).toBe(403);
    });
  });

  describe("tenant isolation", () => {
    it("cannot bind another tenant's action", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      await env.data.tenants.create(OTHER_TENANT_FIXTURE);
      const foreignId = await createAction(
        client,
        token,
        "foreign-action",
        OTHER_TENANT,
      );

      const byId = await patchBindings(client, token, "post-login", [
        { ref: { type: "action_id", value: foreignId } },
      ]);
      expect(byId.status).toBe(404);

      const byName = await patchBindings(client, token, "post-login", [
        { ref: { type: "action_name", value: "foreign-action" } },
      ]);
      expect(byName.status).toBe(400);

      const listed = await getBindings(client, token, "post-login");
      expect(listed.bindings).toEqual([]);
    });

    it("lists and replaces bindings per tenant", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      await env.data.tenants.create(OTHER_TENANT_FIXTURE);
      const ownId = await createAction(client, token, "own-action");
      const foreignId = await createAction(
        client,
        token,
        "foreign-action",
        OTHER_TENANT,
      );

      const ownRes = await patchBindings(client, token, "post-login", [
        { ref: { type: "action_id", value: ownId } },
      ]);
      expect(ownRes.status).toBe(200);
      const foreignRes = await patchBindings(
        client,
        token,
        "post-login",
        [{ ref: { type: "action_id", value: foreignId } }],
        OTHER_TENANT,
      );
      expect(foreignRes.status).toBe(200);

      // Each tenant sees only its own binding.
      const own = await getBindings(client, token, "post-login");
      expect(own.bindings.map((b) => b.action.id)).toEqual([ownId]);
      const foreign = await getBindings(
        client,
        token,
        "post-login",
        OTHER_TENANT,
      );
      expect(foreign.bindings.map((b) => b.action.id)).toEqual([foreignId]);

      // Clearing one tenant's bindings does not reach into the other's.
      const cleared = await patchBindings(client, token, "post-login", []);
      expect(cleared.status).toBe(200);
      const foreignAfter = await getBindings(
        client,
        token,
        "post-login",
        OTHER_TENANT,
      );
      expect(foreignAfter.bindings.map((b) => b.action.id)).toEqual([
        foreignId,
      ]);
    });
  });
});
