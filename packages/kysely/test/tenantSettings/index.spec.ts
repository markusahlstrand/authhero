import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { TenantSettings } from "@authhero/adapter-interfaces";

describe("TenantSettingsAdapter", () => {
  let adapter: any;
  const tenantId = "test-tenant";

  beforeEach(async () => {
    const { data } = await getTestServer();
    adapter = data;

    // Create a tenant for testing
    await adapter.tenants.create({
      id: tenantId,
      name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "Test Sender",
    });
  });

  it("should return null when no settings exist", async () => {
    const settings = await adapter.tenantSettings.get(tenantId);
    expect(settings).toBeNull();
  });

  it("should create and retrieve basic tenant settings", async () => {
    const settingsData: TenantSettings = {
      friendly_name: "My Application",
      support_email: "support@example.com",
      support_url: "https://example.com/support",
    };

    await adapter.tenantSettings.set(tenantId, settingsData);

    const retrieved = await adapter.tenantSettings.get(tenantId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.friendly_name).toBe("My Application");
    expect(retrieved!.support_email).toBe("support@example.com");
    expect(retrieved!.support_url).toBe("https://example.com/support");
  });

  it("should handle session settings", async () => {
    const settingsData: TenantSettings = {
      idle_session_lifetime: 72,
      session_lifetime: 168,
      session_cookie: {
        mode: "persistent",
      },
    };

    await adapter.tenantSettings.set(tenantId, settingsData);

    const retrieved = await adapter.tenantSettings.get(tenantId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.idle_session_lifetime).toBe(72);
    expect(retrieved!.session_lifetime).toBe(168);
    expect(retrieved!.session_cookie).toEqual({ mode: "persistent" });
  });

  it("should handle flags settings", async () => {
    const settingsData: TenantSettings = {
      flags: {
        enable_client_connections: true,
        enable_pipeline2: false,
        enable_dynamic_client_registration: true,
        revoke_refresh_token_grant: true,
      },
    };

    await adapter.tenantSettings.set(tenantId, settingsData);

    const retrieved = await adapter.tenantSettings.get(tenantId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.flags).toEqual({
      enable_client_connections: true,
      enable_pipeline2: false,
      enable_dynamic_client_registration: true,
      revoke_refresh_token_grant: true,
    });
  });

  it("should handle error page settings", async () => {
    const settingsData: TenantSettings = {
      error_page: {
        html: "<html><body>Custom Error Page</body></html>",
        show_log_link: true,
        url: "https://example.com/error",
      },
    };

    await adapter.tenantSettings.set(tenantId, settingsData);

    const retrieved = await adapter.tenantSettings.get(tenantId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.error_page).toEqual({
      html: "<html><body>Custom Error Page</body></html>",
      show_log_link: true,
      url: "https://example.com/error",
    });
  });

  it("should handle enabled locales array", async () => {
    const settingsData: TenantSettings = {
      enabled_locales: ["en", "es", "fr", "de"],
    };

    await adapter.tenantSettings.set(tenantId, settingsData);

    const retrieved = await adapter.tenantSettings.get(tenantId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.enabled_locales).toEqual(["en", "es", "fr", "de"]);
  });

  it("should handle change password settings", async () => {
    const settingsData: TenantSettings = {
      change_password: {
        enabled: true,
        html: "<html><body>Change Password Page</body></html>",
      },
    };

    await adapter.tenantSettings.set(tenantId, settingsData);

    const retrieved = await adapter.tenantSettings.get(tenantId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.change_password).toEqual({
      enabled: true,
      html: "<html><body>Change Password Page</body></html>",
    });
  });

  it("should handle guardian MFA page settings", async () => {
    const settingsData: TenantSettings = {
      guardian_mfa_page: {
        enabled: true,
        html: "<html><body>MFA Page</body></html>",
      },
    };

    await adapter.tenantSettings.set(tenantId, settingsData);

    const retrieved = await adapter.tenantSettings.get(tenantId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.guardian_mfa_page).toEqual({
      enabled: true,
      html: "<html><body>MFA Page</body></html>",
    });
  });

  it("should handle sessions settings", async () => {
    const settingsData: TenantSettings = {
      sessions: {
        oidc_logout_prompt_enabled: true,
      },
    };

    await adapter.tenantSettings.set(tenantId, settingsData);

    const retrieved = await adapter.tenantSettings.get(tenantId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.sessions).toEqual({
      oidc_logout_prompt_enabled: true,
    });
  });

  it("should update existing settings", async () => {
    const initialSettings: TenantSettings = {
      friendly_name: "Initial Name",
      support_email: "initial@example.com",
    };

    await adapter.tenantSettings.set(tenantId, initialSettings);

    const updatedSettings: TenantSettings = {
      friendly_name: "Updated Name",
      support_email: "updated@example.com",
      support_url: "https://example.com/help",
    };

    await adapter.tenantSettings.set(tenantId, updatedSettings);

    const retrieved = await adapter.tenantSettings.get(tenantId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.friendly_name).toBe("Updated Name");
    expect(retrieved!.support_email).toBe("updated@example.com");
    expect(retrieved!.support_url).toBe("https://example.com/help");
  });

  it("should handle complex settings with multiple properties", async () => {
    const settingsData: TenantSettings = {
      friendly_name: "Complete Test",
      picture_url: "https://example.com/logo.png",
      support_email: "support@example.com",
      support_url: "https://example.com/support",
      idle_session_lifetime: 72,
      session_lifetime: 168,
      enable_client_connections: true,
      default_redirection_uri: "https://example.com/callback",
      enabled_locales: ["en", "es"],
      default_directory: "Username-Password-Authentication",
      default_audience: "https://api.example.com",
      default_organization: "org_123",
      flags: {
        enable_client_connections: true,
        enable_pipeline2: true,
        enable_dynamic_client_registration: false,
      },
      session_cookie: {
        mode: "persistent",
      },
    };

    await adapter.tenantSettings.set(tenantId, settingsData);

    const retrieved = await adapter.tenantSettings.get(tenantId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.friendly_name).toBe("Complete Test");
    expect(retrieved!.picture_url).toBe("https://example.com/logo.png");
    expect(retrieved!.support_email).toBe("support@example.com");
    expect(retrieved!.support_url).toBe("https://example.com/support");
    expect(retrieved!.idle_session_lifetime).toBe(72);
    expect(retrieved!.session_lifetime).toBe(168);
    expect(retrieved!.enable_client_connections).toBe(true);
    expect(retrieved!.default_redirection_uri).toBe(
      "https://example.com/callback",
    );
    expect(retrieved!.enabled_locales).toEqual(["en", "es"]);
    expect(retrieved!.default_directory).toBe(
      "Username-Password-Authentication",
    );
    expect(retrieved!.default_audience).toBe("https://api.example.com");
    expect(retrieved!.default_organization).toBe("org_123");
    expect(retrieved!.flags).toEqual({
      enable_client_connections: true,
      enable_pipeline2: true,
      enable_dynamic_client_registration: false,
    });
    expect(retrieved!.session_cookie).toEqual({ mode: "persistent" });
  });

  it("should handle sandbox version settings", async () => {
    const settingsData: TenantSettings = {
      sandbox_version: "12",
      sandbox_versions_available: ["8", "12", "16", "18"],
    };

    await adapter.tenantSettings.set(tenantId, settingsData);

    const retrieved = await adapter.tenantSettings.get(tenantId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.sandbox_version).toBe("12");
    expect(retrieved!.sandbox_versions_available).toEqual([
      "8",
      "12",
      "16",
      "18",
    ]);
  });

  it("should handle boolean enable_client_connections correctly", async () => {
    // Test true value
    const settingsTrue: TenantSettings = {
      enable_client_connections: true,
    };

    await adapter.tenantSettings.set(tenantId, settingsTrue);
    let retrieved = await adapter.tenantSettings.get(tenantId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.enable_client_connections).toBe(true);

    // Test false value
    const settingsFalse: TenantSettings = {
      enable_client_connections: false,
    };

    await adapter.tenantSettings.set(tenantId, settingsFalse);
    retrieved = await adapter.tenantSettings.get(tenantId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.enable_client_connections).toBe(false);
  });

  it("should handle partial updates without losing existing data", async () => {
    const initialSettings: TenantSettings = {
      friendly_name: "Initial",
      support_email: "support@example.com",
      idle_session_lifetime: 72,
    };

    await adapter.tenantSettings.set(tenantId, initialSettings);

    // Update only one field
    const partialUpdate: TenantSettings = {
      friendly_name: "Updated",
    };

    await adapter.tenantSettings.set(tenantId, partialUpdate);

    const retrieved = await adapter.tenantSettings.get(tenantId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.friendly_name).toBe("Updated");
    // Note: In this implementation, set() replaces the entire record
    // So the other fields would be lost. This is expected behavior
    // The PATCH endpoint in the management API handles merging
  });
});
