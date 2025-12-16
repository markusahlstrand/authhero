import { describe, expect, it, afterEach } from "vitest";
import { getTestServer, teardownTestServer } from "./helpers/test-server";

describe("branding", () => {
  afterEach(async () => {
    await teardownTestServer();
  });

  it("should support set and get operations", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // ----------------------------------------
    // Set
    // ----------------------------------------
    await data.branding.set("tenantId", {
      logo_url: "https://example.com/logo.png",
      favicon_url: "https://example.com/favicon.ico",
      colors: {
        primary: "#FF0000",
      },
    });

    // ----------------------------------------
    // Get
    // ----------------------------------------
    const fetched = await data.branding.get("tenantId");
    expect(fetched).not.toBeNull();
    expect(fetched?.logo_url).toBe("https://example.com/logo.png");
    expect(fetched?.favicon_url).toBe("https://example.com/favicon.ico");
    expect(fetched?.colors?.primary).toBe("#FF0000");
  });

  it("should return null for non-existent branding", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const result = await data.branding.get("tenantId");
    expect(result).toBeNull();
  });

  it("should preserve created_at on update", async () => {
    const { data, client, tableName } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // First set
    await data.branding.set("tenantId", {
      logo_url: "https://example.com/logo1.png",
    });

    // Get the raw item to check created_at
    const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
    const firstItem = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          PK: "TENANT#tenantId",
          SK: "BRANDING",
        },
      }),
    );

    const originalCreatedAt = firstItem.Item?.created_at;
    expect(originalCreatedAt).toBeDefined();

    // Wait a bit to ensure timestamps would be different
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second set (update)
    await data.branding.set("tenantId", {
      logo_url: "https://example.com/logo2.png",
    });

    // Get the raw item again
    const secondItem = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          PK: "TENANT#tenantId",
          SK: "BRANDING",
        },
      }),
    );

    // created_at should be preserved
    expect(secondItem.Item?.created_at).toBe(originalCreatedAt);
    // updated_at should be different
    expect(secondItem.Item?.updated_at).not.toBe(originalCreatedAt);
    // logo_url should be updated
    expect(secondItem.Item?.logo_url).toBe("https://example.com/logo2.png");
  });
});
