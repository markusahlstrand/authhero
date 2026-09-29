import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

describe("log-streams", () => {
  describe("GET / - List", () => {
    it("returns empty array when no log streams exist", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await client["log-streams"].$get(
        { header: { "tenant-id": "tenantId" } },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });

    it("returns array of log streams when they exist", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a log stream
      const created = await client["log-streams"].$post(
        {
          header: { "tenant-id": "tenantId" },
          json: {
            name: "test-stream",
            type: "http",
            status: "active",
            sink: {
              http_endpoint: "https://logs.example.com",
              http_content_type: "application/json",
              http_content_format: "JSONLINES",
            },
          },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(created.status).toBe(201);

      // List should now contain the created stream
      const list = await client["log-streams"].$get(
        { header: { "tenant-id": "tenantId" } },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(list.status).toBe(200);
      const streams = (await list.json()) as Array<{
        id: string;
        name: string;
      }>;
      expect(streams).toHaveLength(1);
      expect(streams[0].name).toBe("test-stream");
    });
  });

  describe("POST / - Create", () => {
    it("creates a log stream with valid data", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await client["log-streams"].$post(
        {
          header: { "tenant-id": "tenantId" },
          json: {
            name: "datadog-stream",
            type: "datadog",
            status: "active",
            sink: {
              api_key: "secret-key",
              region: "us",
            },
          },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(201);
      const stream = (await response.json()) as {
        id: string;
        name: string;
        type: string;
        status: string;
      };
      expect(stream.id).toBeTruthy();
      expect(stream.name).toBe("datadog-stream");
      expect(stream.type).toBe("datadog");
      expect(stream.status).toBe("active");
    });

    it("returns 400 when required field 'name' is missing", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await client["log-streams"].$post(
        {
          header: { "tenant-id": "tenantId" },
          json: {
            type: "http",
            status: "active",
            sink: {
              http_endpoint: "https://logs.example.com",
            },
          } as Record<string, unknown>,
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(400);
    });

    it("returns 400 when required field 'type' is missing", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await client["log-streams"].$post(
        {
          header: { "tenant-id": "tenantId" },
          json: {
            name: "incomplete-stream",
            status: "active",
            sink: {
              http_endpoint: "https://logs.example.com",
            },
          } as Record<string, unknown>,
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(400);
    });

    it("returns 400 when required field 'sink' is missing", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await client["log-streams"].$post(
        {
          header: { "tenant-id": "tenantId" },
          json: {
            name: "no-sink-stream",
            type: "http",
            status: "active",
          } as Record<string, unknown>,
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(400);
    });

    it("returns 400 when 'type' is invalid", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await client["log-streams"].$post(
        {
          header: { "tenant-id": "tenantId" },
          json: {
            name: "invalid-type-stream",
            type: "invalid",
            sink: {
              endpoint: "https://logs.example.com",
            },
          } as Record<string, unknown>,
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(400);
    });
  });

  describe("GET /{id} - Get by ID", () => {
    it("returns a log stream by id", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a log stream
      const created = await client["log-streams"].$post(
        {
          header: { "tenant-id": "tenantId" },
          json: {
            name: "get-test-stream",
            type: "splunk",
            status: "active",
            sink: {
              hec_endpoint: "https://splunk.example.com",
              hec_token: "token123",
            },
          },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(created.status).toBe(201);
      const createdStream = (await created.json()) as { id: string };

      // Get the created stream
      const get = await client["log-streams"][":id"].$get(
        {
          header: { "tenant-id": "tenantId" },
          param: { id: createdStream.id },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(get.status).toBe(200);
      const stream = (await get.json()) as {
        id: string;
        name: string;
        type: string;
      };
      expect(stream.id).toBe(createdStream.id);
      expect(stream.name).toBe("get-test-stream");
      expect(stream.type).toBe("splunk");
    });

    it("returns 404 when log stream does not exist", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await client["log-streams"][":id"].$get(
        {
          header: { "tenant-id": "tenantId" },
          param: { id: "non-existent-id" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /{id} - Update", () => {
    it("updates a log stream", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a log stream
      const created = await client["log-streams"].$post(
        {
          header: { "tenant-id": "tenantId" },
          json: {
            name: "update-test-stream",
            type: "eventbridge",
            status: "active",
            sink: {
              aws_account_id: "123456789",
              aws_region: "us-east-1",
            },
          },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(created.status).toBe(201);
      const createdStream = (await created.json()) as { id: string };

      // Update the stream
      const patch = await client["log-streams"][":id"].$patch(
        {
          header: { "tenant-id": "tenantId" },
          param: { id: createdStream.id },
          json: { status: "paused" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(patch.status).toBe(200);
      const updated = (await patch.json()) as {
        id: string;
        status: string;
        name: string;
      };
      expect(updated.id).toBe(createdStream.id);
      expect(updated.status).toBe("paused");
      expect(updated.name).toBe("update-test-stream");
    });

    it("supports partial updates", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a log stream with multiple fields
      const created = await client["log-streams"].$post(
        {
          header: { "tenant-id": "tenantId" },
          json: {
            name: "partial-update-stream",
            type: "sumo",
            status: "active",
            isPriority: false,
            sink: {
              collector_endpoint: "https://sumo.example.com",
            },
          },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(created.status).toBe(201);
      const createdStream = (await created.json()) as {
        id: string;
        isPriority: boolean;
      };

      // Update only the isPriority field
      const patch = await client["log-streams"][":id"].$patch(
        {
          header: { "tenant-id": "tenantId" },
          param: { id: createdStream.id },
          json: { isPriority: true },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(patch.status).toBe(200);
      const updated = (await patch.json()) as {
        isPriority: boolean;
        name: string;
        type: string;
      };
      expect(updated.isPriority).toBe(true);
      expect(updated.name).toBe("partial-update-stream");
      expect(updated.type).toBe("sumo");
    });

    it("returns 404 when log stream does not exist", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await client["log-streams"][":id"].$patch(
        {
          header: { "tenant-id": "tenantId" },
          param: { id: "non-existent-id" },
          json: { status: "paused" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /{id} - Delete", () => {
    it("deletes a log stream", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a log stream
      const created = await client["log-streams"].$post(
        {
          header: { "tenant-id": "tenantId" },
          json: {
            name: "delete-test-stream",
            type: "http",
            status: "active",
            sink: {
              http_endpoint: "https://logs.example.com",
              http_content_type: "application/json",
            },
          },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(created.status).toBe(201);
      const createdStream = (await created.json()) as { id: string };

      // Delete the stream
      const del = await client["log-streams"][":id"].$delete(
        {
          header: { "tenant-id": "tenantId" },
          param: { id: createdStream.id },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(del.status).toBe(204);
    });

    it("verifies log stream is gone after deletion", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a log stream
      const created = await client["log-streams"].$post(
        {
          header: { "tenant-id": "tenantId" },
          json: {
            name: "verify-delete-stream",
            type: "eventgrid",
            status: "active",
            sink: {
              azure_event_grid_endpoint: "https://azure.example.com",
            },
          },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(created.status).toBe(201);
      const createdStream = (await created.json()) as { id: string };

      // Delete the stream
      const del = await client["log-streams"][":id"].$delete(
        {
          header: { "tenant-id": "tenantId" },
          param: { id: createdStream.id },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(del.status).toBe(204);

      // Verify it's gone
      const get = await client["log-streams"][":id"].$get(
        {
          header: { "tenant-id": "tenantId" },
          param: { id: createdStream.id },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(get.status).toBe(404);
    });

    it("returns 404 when log stream does not exist", async () => {
      const { managementApp, env } = await getTestServer();
      const client = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await client["log-streams"][":id"].$delete(
        {
          header: { "tenant-id": "tenantId" },
          param: { id: "non-existent-id" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });
  });

  it("creates, gets, lists, updates, and deletes a log stream - full integration", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create
    const create = await client["log-streams"].$post(
      {
        header: { "tenant-id": "tenantId" },
        json: {
          name: "loki",
          type: "http",
          status: "active",
          sink: {
            http_endpoint: "https://logs.example.com",
            http_content_type: "application/json",
            http_content_format: "JSONLINES",
            http_authorization: "Bearer x",
          },
        },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string; name: string };
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("loki");

    // Get
    const get = await client["log-streams"][":id"].$get(
      {
        header: { "tenant-id": "tenantId" },
        param: { id: created.id },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(get.status).toBe(200);
    expect((await get.json()).name).toBe("loki");

    // List
    const list = await client["log-streams"].$get(
      { header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(list.status).toBe(200);
    expect(await list.json()).toHaveLength(1);

    // Update
    const patch = await client["log-streams"][":id"].$patch(
      {
        header: { "tenant-id": "tenantId" },
        param: { id: created.id },
        json: { status: "paused" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(patch.status).toBe(200);
    expect((await patch.json()).status).toBe("paused");

    // Delete
    const del = await client["log-streams"][":id"].$delete(
      {
        header: { "tenant-id": "tenantId" },
        param: { id: created.id },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(del.status).toBe(204);

    const afterDelete = await client["log-streams"].$get(
      { header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(await afterDelete.json()).toEqual([]);
  });
});
