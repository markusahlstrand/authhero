import { describe, expect, it, afterEach } from "vitest";
import { getTestServer, teardownTestServer } from "./helpers/test-server";

describe("promptSettings", () => {
  afterEach(async () => {
    await teardownTestServer();
  });

  it("should return default settings for non-existent tenant", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const settings = await data.promptSettings.get("tenantId");
    expect(settings.universal_login_experience).toBe("new");
    expect(settings.identifier_first).toBe(false);
    expect(settings.password_first).toBe(false);
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
    await data.promptSettings.set("tenantId", {
      identifier_first: true,
      password_first: true,
    });

    // ----------------------------------------
    // Get
    // ----------------------------------------
    const settings = await data.promptSettings.get("tenantId");
    expect(settings.identifier_first).toBe(true);
    expect(settings.password_first).toBe(true);
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
    await data.promptSettings.set("tenantId", {
      identifier_first: true,
    });

    // Get the raw item to check created_at
    const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
    const firstItem = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          PK: "TENANT#tenantId",
          SK: "PROMPT_SETTINGS",
        },
      }),
    );

    const originalCreatedAt = firstItem.Item?.created_at;
    expect(originalCreatedAt).toBeDefined();

    // Wait a bit to ensure timestamps would be different
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second set (update)
    await data.promptSettings.set("tenantId", {
      password_first: true,
    });

    // Get the raw item again
    const secondItem = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          PK: "TENANT#tenantId",
          SK: "PROMPT_SETTINGS",
        },
      }),
    );

    // created_at should be preserved
    expect(secondItem.Item?.created_at).toBe(originalCreatedAt);
    // updated_at should be different
    expect(secondItem.Item?.updated_at).not.toBe(originalCreatedAt);
    // Both settings should now be true
    expect(secondItem.Item?.identifier_first).toBe(true);
    expect(secondItem.Item?.password_first).toBe(true);
  });
});
