import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { ActionExecutionInsert } from "@authhero/adapter-interfaces";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

const TENANT = "tenantId";
const OTHER_TENANT = "otherTenant";

function executionFixture(
  overrides: Partial<ActionExecutionInsert> = {},
): ActionExecutionInsert {
  return {
    id: "exec-1",
    trigger_id: "post-login",
    status: "final",
    results: [
      {
        action_name: "Slack notify",
        error: null,
        started_at: "2026-01-01T00:00:00.000Z",
        ended_at: "2026-01-01T00:00:01.000Z",
      },
    ],
    logs: [
      {
        action_name: "Slack notify",
        lines: [{ level: "log", message: "posted to #general" }],
      },
    ],
    ...overrides,
  };
}

const OTHER_TENANT_FIXTURE = {
  id: OTHER_TENANT,
  friendly_name: "Other Tenant",
  audience: "https://other.example.com",
  sender_email: "login@other.example.com",
  sender_name: "Other",
};

describe("management-api action executions", () => {
  it("returns the Auth0 execution shape without internal fields", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const created = await env.data.actionExecutions.create(
      TENANT,
      executionFixture(),
    );

    const response = await client.actions.executions[":id"].$get(
      {
        param: { id: created.id },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      id: created.id,
      trigger_id: "post-login",
      status: "final",
      results: created.results,
      created_at: created.created_at,
      updated_at: created.updated_at,
    });
    // The public shape mirrors Auth0: no tenant_id, and the captured console
    // output stays behind the separate /logs endpoint.
    expect(body).not.toHaveProperty("tenant_id");
    expect(body).not.toHaveProperty("logs");
  });

  it("returns the captured console output for an execution", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const created = await env.data.actionExecutions.create(
      TENANT,
      executionFixture(),
    );

    const response = await client.actions.executions[":id"].logs.$get(
      {
        param: { id: created.id },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      logs: Array<{ action_name: string; lines: unknown[] }>;
    };
    expect(body.logs).toEqual([
      {
        action_name: "Slack notify",
        lines: [{ level: "log", message: "posted to #general" }],
      },
    ]);
  });

  it("returns an empty log array for an execution that captured nothing", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const created = await env.data.actionExecutions.create(
      TENANT,
      executionFixture({ id: "exec-no-logs", logs: undefined }),
    );

    const response = await client.actions.executions[":id"].logs.$get(
      {
        param: { id: created.id },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { logs: unknown[] };
    expect(body.logs).toEqual([]);
  });

  it("returns 404 for an unknown execution id", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await client.actions.executions[":id"].$get(
      {
        param: { id: "does-not-exist" },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(404);

    const logsResponse = await client.actions.executions[":id"].logs.$get(
      {
        param: { id: "does-not-exist" },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(logsResponse.status).toBe(404);
  });

  it("does not leak an execution belonging to another tenant", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.tenants.create(OTHER_TENANT_FIXTURE);
    const foreign = await env.data.actionExecutions.create(
      OTHER_TENANT,
      executionFixture({ id: "exec-foreign" }),
    );

    const response = await client.actions.executions[":id"].$get(
      {
        param: { id: foreign.id },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(404);

    const logsResponse = await client.actions.executions[":id"].logs.$get(
      {
        param: { id: foreign.id },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(logsResponse.status).toBe(404);

    // Still readable from its own tenant — the 404 above is scoping, not a
    // failed write.
    const ownTenantResponse = await client.actions.executions[":id"].$get(
      {
        param: { id: foreign.id },
        header: { "tenant-id": OTHER_TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(ownTenantResponse.status).toBe(200);
  });

  it("requires a read:actions scope", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const tokenWithoutScope = await getAdminToken({ permissions: [] });

    const created = await env.data.actionExecutions.create(
      TENANT,
      executionFixture(),
    );

    const response = await client.actions.executions[":id"].$get(
      {
        param: { id: created.id },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${tokenWithoutScope}` } },
    );

    expect(response.status).toBe(403);
  });
});
