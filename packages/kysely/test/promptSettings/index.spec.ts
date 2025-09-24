import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("promptSettings", () => {
  it("should set prompt settings without SQLite binding errors", async () => {
    const { data } = await getTestServer();

    // Create a tenant first
    await data.tenants.create({
      id: "tenantId",
      name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // ----------------------------------------
    // Set prompt settings - this should replicate the failing test
    // ----------------------------------------
    const promptSettings = {
      identifier_first: false,
      password_first: false,
    };

    // This should not throw "SQLite3 can only bind numbers, strings, bigints, buffers, and null"
    await data.promptSettings.set("tenantId", promptSettings);

    // Verify the settings were stored correctly
    const storedSettings = await data.promptSettings.get("tenantId");

    expect(storedSettings).toEqual({
      identifier_first: false,
      password_first: false,
      universal_login_experience: "new", // default value
      webauthn_platform_first_factor: false, // default value
    });
  });

  it("should handle prompt settings with all fields", async () => {
    const { data } = await getTestServer();

    // Create a tenant first
    await data.tenants.create({
      id: "tenantId2",
      name: "Test Tenant 2",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // ----------------------------------------
    // Set prompt settings with all possible fields
    // ----------------------------------------
    const promptSettings = {
      identifier_first: true,
      password_first: true,
      webauthn_platform_first_factor: true,
      universal_login_experience: "classic" as const,
    };

    // This should not throw SQLite binding errors
    await data.promptSettings.set("tenantId2", promptSettings);

    // Verify the settings were stored correctly
    const storedSettings = await data.promptSettings.get("tenantId2");

    expect(storedSettings).toEqual(
      expect.objectContaining({
        identifier_first: true,
        password_first: true,
        universal_login_experience: "classic",
        webauthn_platform_first_factor: true,
      }),
    );
  });

  it("should handle partial updates correctly", async () => {
    const { data } = await getTestServer();

    // Create a tenant first
    await data.tenants.create({
      id: "tenantId3",
      name: "Test Tenant 3",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // Create initial settings
    await data.promptSettings.set("tenantId3", {
      identifier_first: true,
      password_first: true,
    });

    // Update only some fields
    await data.promptSettings.set("tenantId3", {
      identifier_first: false,
    });

    // Verify partial update worked
    const storedSettings = await data.promptSettings.get("tenantId3");

    expect(storedSettings.identifier_first).toBe(false);
    // Other fields should remain unchanged or have defaults
    expect(storedSettings.universal_login_experience).toBe("new");
  });
});
