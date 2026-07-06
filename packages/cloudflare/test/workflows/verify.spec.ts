import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { CloudflareApiClient } from "../../src/wfp-provisioner";
import {
  createProvisionVerifier,
  TenantProvisionVerificationError,
} from "../../src/workflows";

const ACCOUNT_ID = "acc_test";
const API_BASE = "https://api.cloudflare.com/client/v4";
const DB_ID = "db_x";

const server = setupServer();
let capturedSql: string[];

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  server.resetHandlers();
  capturedSql = [];
});

function mockQueryResult(keyCount: number, tenantCount: number) {
  server.use(
    http.post(
      `${API_BASE}/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`,
      async ({ request }) => {
        const body = (await request.json()) as { sql: string };
        capturedSql.push(body.sql);
        return HttpResponse.json({
          success: true,
          result: [
            {
              success: true,
              results: [{ key_count: keyCount, tenant_count: tenantCount }],
            },
          ],
        });
      },
    ),
  );
}

function verifier() {
  const client = new CloudflareApiClient({
    accountId: ACCOUNT_ID,
    apiToken: "token",
  });
  return createProvisionVerifier({ client });
}

describe("createProvisionVerifier", () => {
  it("resolves when keys and the tenant row exist", async () => {
    mockQueryResult(2, 1);
    await expect(verifier()(DB_ID, "kvartal")).resolves.toBeUndefined();
    expect(capturedSql[0]).toContain("FROM keys");
    expect(capturedSql[0]).toContain("FROM tenants WHERE id = 'kvartal'");
  });

  it("throws naming the keys check when the keys table is empty", async () => {
    mockQueryResult(0, 1);
    await expect(verifier()(DB_ID, "kvartal")).rejects.toThrow(
      /at least 1 signing key/,
    );
  });

  it("throws naming the tenant row when it is missing", async () => {
    mockQueryResult(3, 0);
    const error = await verifier()(DB_ID, "kvartal")
      .then(() => null)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TenantProvisionVerificationError);
    if (error instanceof TenantProvisionVerificationError) {
      expect(error.message).toMatch(/tenant row "kvartal" missing/);
      expect(error.checks).toEqual({ keyCount: 3, tenantRowCount: 0 });
    }
  });

  it("escapes the tenant id in the SQL literal", async () => {
    mockQueryResult(1, 1);
    await verifier()(DB_ID, "kvar'tal");
    expect(capturedSql[0]).toContain("id = 'kvar''tal'");
  });

  it("propagates Cloudflare API errors", async () => {
    server.use(
      http.post(
        `${API_BASE}/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`,
        () => HttpResponse.json({ success: false }, { status: 500 }),
      ),
    );
    await expect(verifier()(DB_ID, "kvartal")).rejects.toThrow();
  });
});
