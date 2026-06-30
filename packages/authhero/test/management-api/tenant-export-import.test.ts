import { describe, it, expect } from "vitest";
import { getAdminToken, createToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";

async function gunzip(buffer: ArrayBuffer): Promise<string> {
  const stream = new Blob([buffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

describe("GET /tenant-data/export", () => {
  it("returns a gzipped JSON-lines export of the tenant", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const res = await managementApp.request(
      "/tenant-data/export",
      {
        headers: { authorization: `Bearer ${token}`, "tenant-id": "tenantId" },
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/gzip");

    const text = await gunzip(await res.arrayBuffer());
    const entities = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).entity);

    expect(entities).toContain("tenants");
    expect(entities).toContain("clients");
  });

  it("returns an uncompressed NDJSON export when gzip=false", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const res = await managementApp.request(
      "/tenant-data/export?gzip=false",
      {
        headers: { authorization: `Bearer ${token}`, "tenant-id": "tenantId" },
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");

    const text = await res.text();
    const entities = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).entity);

    expect(entities).toContain("tenants");
    expect(entities).toContain("clients");
  });

  it("returns 500 (not a corrupt 200) when the export fails before the first row", async () => {
    // Hit the full app so the root onError converts the thrown HTTPException
    // into a 500 response (the management app deliberately rethrows >=500s).
    const { app, env } = await getTestServer();
    const token = await getAdminToken();

    // The export streams, so status is committed before any row is produced.
    // A throw on the very first adapter call must surface as a real error
    // rather than a 200 with a truncated 10-byte gzip header.
    env.data.tenants.get = async () => {
      throw new Error("boom");
    };

    const res = await app.request(
      "/api/v2/tenant-data/export",
      {
        headers: { authorization: `Bearer ${token}`, "tenant-id": "tenantId" },
      },
      env,
    );

    expect(res.status).toBe(500);
  });

  it("rejects include_password_hashes without the elevated scope", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const res = await managementApp.request(
      "/tenant-data/export?include_password_hashes=true",
      {
        headers: { authorization: `Bearer ${token}`, "tenant-id": "tenantId" },
      },
      env,
    );

    expect(res.status).toBe(403);
  });

  it("allows include_password_hashes with the elevated scope", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await createToken({
      permissions: ["read:users", "read:user_password_hashes"],
    });

    const res = await managementApp.request(
      "/tenant-data/export?include_password_hashes=true",
      {
        headers: { authorization: `Bearer ${token}`, "tenant-id": "tenantId" },
      },
      env,
    );

    expect(res.status).toBe(200);
  });
});

describe("POST /tenant-data/import", () => {
  it("imports plain JSON-lines and preserves ids + timestamps", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const body =
      JSON.stringify({
        entity: "clients",
        data: {
          client_id: "http-imported",
          name: "HTTP Imported",
          created_at: "2020-01-01T00:00:00.000Z",
          updated_at: "2020-01-01T00:00:00.000Z",
        },
      }) + "\n";

    const res = await managementApp.request(
      "/tenant-data/import",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/x-ndjson",
        },
        body,
      },
      env,
    );

    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.counts.clients).toBe(1);
    expect(result.errors).toEqual([]);

    const client = await env.data.clients.get("tenantId", "http-imported");
    expect(client?.client_id).toBe("http-imported");
    expect(client?.created_at).toBe("2020-01-01T00:00:00.000Z");
  });

  it("returns 400 for a corrupt gzip body instead of a 500", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    // gzip magic bytes (0x1f 0x8b) followed by garbage — decompression fails.
    const body = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02, 0x03]);

    const res = await managementApp.request(
      "/tenant-data/import",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/gzip",
        },
        body,
      },
      env,
    );

    expect(res.status).toBe(400);
  });

  it("accepts a gzipped JSON-lines body", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const body = await gzip(
      JSON.stringify({
        entity: "clients",
        data: {
          client_id: "gz-imported",
          name: "Gzip Imported",
          created_at: "2021-02-03T04:05:06.000Z",
          updated_at: "2021-02-03T04:05:06.000Z",
        },
      }) + "\n",
    );

    const res = await managementApp.request(
      "/tenant-data/import",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/gzip",
        },
        body,
      },
      env,
    );

    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.counts.clients).toBe(1);

    const client = await env.data.clients.get("tenantId", "gz-imported");
    expect(client?.created_at).toBe("2021-02-03T04:05:06.000Z");
  });
});
