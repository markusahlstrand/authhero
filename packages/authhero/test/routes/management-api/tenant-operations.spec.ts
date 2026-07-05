import { describe, it, expect } from "vitest";
import { createToken, getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import type { DataAdapters } from "@authhero/adapter-interfaces";
import type { TenantOperationExecutorBinding } from "../../../src/types";

// Driven through the full `app` (management API at /api/v2) so the parent
// onError resolves 5xx responses, mirroring tenant-redeploy.spec.ts.

// Stub executor backed by the test server's own adapters: creates the row,
// records one event, and finalizes — modelling the inline engine's
// "terminal before resolve" contract without importing multi-tenancy.
function createStubExecutor(getData: () => DataAdapters | undefined) {
  const executor: TenantOperationExecutorBinding = {
    engine: "inline",
    async enqueue(params) {
      const data = getData();
      if (!data?.tenantOperations || !data.tenantOperationEvents) {
        throw new Error("stub executor: operations adapters missing");
      }
      const created = await data.tenantOperations.create({
        tenant_id: params.tenant_id,
        kind: params.kind,
        engine: "inline",
        initiated_by: params.initiated_by,
      });
      await data.tenantOperationEvents.create({
        operation_id: created.id,
        step: params.kind,
        outcome: "succeeded",
      });
      await data.tenantOperations.update(created.id, {
        status: "succeeded",
        finished_at: new Date().toISOString(),
      });
      const finished = await data.tenantOperations.get(created.id);
      if (!finished) throw new Error("stub executor: operation vanished");
      return finished;
    },
  };
  return executor;
}

describe("management-api tenant operations", () => {
  it("lists an empty history for a fresh tenant", async () => {
    const { app, env } = await getTestServer();
    const token = await getAdminToken();

    const response = await app.request(
      "/api/v2/tenants/tenantId/operations",
      {
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      operations: [],
      start: 0,
      limit: 50,
      length: 0,
    });
  });

  it("enqueues an upgrade and exposes it via GET /operations/{id}", async () => {
    const dataRef: { current?: DataAdapters } = {};
    const { app, env } = await getTestServer({
      tenantOperationExecutor: createStubExecutor(() => dataRef.current),
    });
    dataRef.current = env.data;

    const token = await getAdminToken();
    const response = await app.request(
      "/api/v2/tenants/tenantId/operations",
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ kind: "upgrade" }),
      },
      env,
    );

    expect(response.status).toBe(201);
    const operation = await response.json();
    expect(operation).toMatchObject({
      tenant_id: "tenantId",
      kind: "upgrade",
      status: "succeeded",
      engine: "inline",
    });

    const detailResponse = await app.request(
      `/api/v2/operations/${operation.id}`,
      {
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
        },
      },
      env,
    );
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json();
    expect(detail.id).toBe(operation.id);
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0]).toMatchObject({
      step: "upgrade",
      outcome: "succeeded",
    });

    const listResponse = await app.request(
      "/api/v2/tenants/tenantId/operations",
      {
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
        },
      },
      env,
    );
    const list = await listResponse.json();
    expect(list.operations).toHaveLength(1);
    expect(list.operations[0].id).toBe(operation.id);
  });

  it("rejects lifecycle-managed kinds with 400", async () => {
    const dataRef: { current?: DataAdapters } = {};
    const { app, env } = await getTestServer({
      tenantOperationExecutor: createStubExecutor(() => dataRef.current),
    });
    dataRef.current = env.data;

    const token = await getAdminToken();
    const response = await app.request(
      "/api/v2/tenants/tenantId/operations",
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ kind: "provision" }),
      },
      env,
    );

    expect(response.status).toBe(400);
  });

  it("returns 501 for not-yet-supported kinds", async () => {
    const dataRef: { current?: DataAdapters } = {};
    const { app, env } = await getTestServer({
      tenantOperationExecutor: createStubExecutor(() => dataRef.current),
    });
    dataRef.current = env.data;

    const token = await getAdminToken();
    const response = await app.request(
      "/api/v2/tenants/tenantId/operations",
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ kind: "backup" }),
      },
      env,
    );

    expect(response.status).toBe(501);
  });

  it("returns 501 when no executor is configured", async () => {
    const { app, env } = await getTestServer();

    const token = await getAdminToken();
    const response = await app.request(
      "/api/v2/tenants/tenantId/operations",
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ kind: "upgrade" }),
      },
      env,
    );

    expect(response.status).toBe(501);
  });

  it("returns 403 when the caller is not the control plane", async () => {
    const dataRef: { current?: DataAdapters } = {};
    const { app, env } = await getTestServer({
      tenantOperationExecutor: createStubExecutor(() => dataRef.current),
    });
    dataRef.current = env.data;

    env.data.multiTenancyConfig = {
      controlPlaneTenantId: "control_plane",
    };

    const token = await getAdminToken();
    const response = await app.request(
      "/api/v2/tenants/tenantId/operations",
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ kind: "upgrade" }),
      },
      env,
    );

    expect(response.status).toBe(403);
  });

  it("hides other tenants' operations from non-control-plane callers", async () => {
    const { app, env } = await getTestServer();

    // Designate a control plane BEFORE any request — the management app
    // wraps the data adapter on first use, so a later mutation isn't seen
    // (same constraint as the redeploy 403 test).
    env.data.multiTenancyConfig = {
      controlPlaneTenantId: "control_plane",
    };

    // Seed the operation directly: POST is control-plane-only, and the
    // acting tenants in this test deliberately aren't the control plane.
    await env.data.tenants.create({
      id: "otherTenant",
      friendly_name: "Other Tenant",
    });
    const operation = await env.data.tenantOperations!.create({
      tenant_id: "tenantId",
      kind: "upgrade",
      engine: "inline",
    });

    const token = await getAdminToken();

    // A foreign tenant gets a 404 for the operation and a 403 for the list.
    const foreignGet = await app.request(
      `/api/v2/operations/${operation.id}`,
      {
        headers: { "tenant-id": "otherTenant", authorization: `Bearer ${token}` },
      },
      env,
    );
    expect(foreignGet.status).toBe(404);

    const foreignList = await app.request(
      "/api/v2/tenants/tenantId/operations",
      {
        headers: { "tenant-id": "otherTenant", authorization: `Bearer ${token}` },
      },
      env,
    );
    expect(foreignList.status).toBe(403);

    // The owning tenant can still read its own history.
    const ownGet = await app.request(
      `/api/v2/operations/${operation.id}`,
      {
        headers: { "tenant-id": "tenantId", authorization: `Bearer ${token}` },
      },
      env,
    );
    expect(ownGet.status).toBe(200);
  });

  it("returns 404 for an unknown operation id", async () => {
    const { app, env } = await getTestServer();
    const token = await getAdminToken();

    const response = await app.request(
      "/api/v2/operations/op_does_not_exist",
      {
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
        },
      },
      env,
    );

    expect(response.status).toBe(404);
  });

  it("rejects tokens without the tenant_operations scopes", async () => {
    const { app, env } = await getTestServer();
    const token = await createToken({ permissions: ["read:users"] });

    const response = await app.request(
      "/api/v2/tenants/tenantId/operations",
      {
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
        },
      },
      env,
    );

    expect(response.status).toBe(403);
  });
});
