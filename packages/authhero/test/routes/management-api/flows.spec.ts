import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { Flow } from "@authhero/adapter-interfaces";

describe("flows", () => {
  it("should support crud", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // --------------------------------------------
    // POST - Create flow without actions
    // --------------------------------------------
    const createFlowResponse = await managementClient.flows.$post(
      {
        json: {
          name: "verify-email-flow",
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(createFlowResponse.status).toBe(201);
    const createdFlow = await createFlowResponse.json();
    const { created_at, updated_at, id, ...rest } = createdFlow;
    expect(rest).toMatchObject({
      name: "verify-email-flow",
      actions: [],
    });
    expect(created_at).toBeTypeOf("string");
    expect(updated_at).toBeTypeOf("string");
    expect(id).toBeTypeOf("string");
    expect(id).toMatch(/^af_/); // Flow IDs should start with af_

    // --------------------------------------------
    // PATCH - Update flow with actions
    // --------------------------------------------
    const updateFlowResponse = await managementClient.flows[":id"].$patch(
      {
        param: {
          id: id!,
        },
        json: {
          name: "verify-email-flow-updated",
          actions: [
            {
              id: "action1",
              type: "EMAIL",
              action: "VERIFY_EMAIL",
              params: {
                email: "{{user.email}}",
                rules: {
                  block_disposable_emails: true,
                },
              },
            },
          ],
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(updateFlowResponse.status).toBe(200);
    const updatedFlow = (await updateFlowResponse.json()) as Flow;
    expect(updatedFlow.name).toBe("verify-email-flow-updated");
    expect(updatedFlow.actions).toHaveLength(1);
    expect(updatedFlow.actions[0]).toMatchObject({
      id: "action1",
      type: "EMAIL",
      action: "VERIFY_EMAIL",
    });

    // --------------------------------------------
    // GET - Fetch the flow
    // --------------------------------------------
    const getFlowResponse = await managementClient.flows[":id"].$get(
      {
        param: {
          id: id!,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(getFlowResponse.status).toBe(200);
    const fetchedFlow = await getFlowResponse.json();
    expect(fetchedFlow.name).toBe("verify-email-flow-updated");
    expect(fetchedFlow.actions).toHaveLength(1);

    // --------------------------------------------
    // DELETE
    // --------------------------------------------
    const deleteFlowResponse = await managementClient.flows[":id"].$delete(
      {
        param: {
          id: id!,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(deleteFlowResponse.status).toBe(200);

    // --------------------------------------------
    // LIST - should be empty after delete
    // --------------------------------------------
    const listFlowsResponse = await managementClient.flows.$get(
      {
        query: {},
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(listFlowsResponse.status).toBe(200);
    const flows = await listFlowsResponse.json();
    expect(flows).toEqual([]);
  });

  it("should create flow with AUTH0 UPDATE_USER action", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const createFlowResponse = await managementClient.flows.$post(
      {
        json: {
          name: "update-user-flow",
          actions: [
            {
              id: "update-action",
              type: "AUTH0",
              action: "UPDATE_USER",
              params: {
                user_id: "{{user.id}}",
                changes: {
                  email_verified: true,
                },
              },
            },
          ],
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(createFlowResponse.status).toBe(201);
    const flow = await createFlowResponse.json();
    expect(flow.name).toBe("update-user-flow");
    expect(flow.actions).toHaveLength(1);
    expect(flow.actions[0]).toMatchObject({
      id: "update-action",
      type: "AUTH0",
      action: "UPDATE_USER",
      params: {
        user_id: "{{user.id}}",
        changes: {
          email_verified: true,
        },
      },
    });
  });

  it("should list flows with include_totals", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a flow first
    await managementClient.flows.$post(
      {
        json: {
          name: "test-flow",
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    // List with include_totals
    const listResponse = await managementClient.flows.$get(
      {
        query: {
          include_totals: "true",
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(listResponse.status).toBe(200);
    const result = (await listResponse.json()) as {
      flows: Flow[];
      start: number;
      limit: number;
      length: number;
    };
    expect(result.flows).toHaveLength(1);
    expect(result.length).toBe(1);
    expect(result.start).toBe(0);
  });

  it("should return 404 for non-existent flow", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const getResponse = await managementClient.flows[":id"].$get(
      {
        param: {
          id: "af_nonexistent123456789",
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(getResponse.status).toBe(404);
  });

  it("should return 404 when deleting non-existent flow", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const deleteResponse = await managementClient.flows[":id"].$delete(
      {
        param: {
          id: "af_nonexistent123456789",
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(deleteResponse.status).toBe(404);
  });

  it("should return 404 when updating non-existent flow", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const patchResponse = await managementClient.flows[":id"].$patch(
      {
        param: {
          id: "af_nonexistent123456789",
        },
        json: {
          name: "updated-name",
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(patchResponse.status).toBe(404);
  });
});
