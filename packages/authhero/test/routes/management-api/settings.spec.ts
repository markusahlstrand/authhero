import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

describe("settings", () => {
  it("should return tenant when settings endpoint is called", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const settingsResponse = await managementClient.tenants.settings.$get(
      {
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

    expect(settingsResponse.status).toBe(200);
    const settings = await settingsResponse.json();
    // Settings endpoint now returns the tenant (since they're the same entity)
    expect(settings.id).toBe("tenantId");
    expect(settings.friendly_name).toBe("Test Tenant");
  });

  it("should set and get basic tenant settings", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const settingsData = {
      friendly_name: "My Application",
      support_email: "support@example.com",
      support_url: "https://example.com/support",
    };

    // Update the settings
    const updateSettingsResponse =
      await managementClient.tenants.settings.$patch(
        {
          header: {
            "tenant-id": "tenantId",
          },
          json: settingsData,
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

    expect(updateSettingsResponse.status).toBe(200);
    const updatedSettings = await updateSettingsResponse.json();
    expect(updatedSettings).toMatchObject(settingsData);

    // Get the updated settings
    const settingsResponse = await managementClient.tenants.settings.$get(
      {
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

    expect(settingsResponse.status).toBe(200);
    const settings = await settingsResponse.json();
    expect(settings).toMatchObject(settingsData);
  });

  it("should handle session settings", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const settingsData = {
      idle_session_lifetime: 72,
      session_lifetime: 168,
      session_cookie: {
        mode: "persistent" as const,
      },
    };

    const updateResponse = await managementClient.tenants.settings.$patch(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: settingsData,
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.idle_session_lifetime).toBe(72);
    expect(updated.session_lifetime).toBe(168);
    expect(updated.session_cookie).toEqual({ mode: "persistent" });
  });

  it("should handle flags settings", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const settingsData = {
      flags: {
        enable_client_connections: true,
        enable_pipeline2: false,
        enable_dynamic_client_registration: true,
        revoke_refresh_token_grant: true,
      },
    };

    const updateResponse = await managementClient.tenants.settings.$patch(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: settingsData,
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.flags).toEqual({
      enable_client_connections: true,
      enable_pipeline2: false,
      enable_dynamic_client_registration: true,
      revoke_refresh_token_grant: true,
    });
  });

  it("should handle error page settings", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const settingsData = {
      error_page: {
        html: "<html><body>Custom Error Page</body></html>",
        show_log_link: true,
        url: "https://example.com/error",
      },
    };

    const updateResponse = await managementClient.tenants.settings.$patch(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: settingsData,
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.error_page).toEqual({
      html: "<html><body>Custom Error Page</body></html>",
      show_log_link: true,
      url: "https://example.com/error",
    });
  });

  it("should handle enabled locales array", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const settingsData = {
      enabled_locales: ["en", "es", "fr", "de"],
    };

    const updateResponse = await managementClient.tenants.settings.$patch(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: settingsData,
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.enabled_locales).toEqual(["en", "es", "fr", "de"]);
  });

  it("should merge partial updates with existing settings", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // Set initial settings
    const initialSettings = {
      friendly_name: "Initial Name",
      support_email: "initial@example.com",
      idle_session_lifetime: 72,
    };

    await managementClient.tenants.settings.$patch(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: initialSettings,
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    // Update only one field
    const partialUpdate = {
      friendly_name: "Updated Name",
    };

    const updateResponse = await managementClient.tenants.settings.$patch(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: partialUpdate,
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();

    // Should have the updated field and keep the existing ones
    expect(updated.friendly_name).toBe("Updated Name");
    expect(updated.support_email).toBe("initial@example.com");
    expect(updated.idle_session_lifetime).toBe(72);
  });

  it("should handle complex nested settings", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const settingsData = {
      friendly_name: "Complete Test",
      picture_url: "https://example.com/logo.png",
      support_email: "support@example.com",
      support_url: "https://example.com/support",
      idle_session_lifetime: 72,
      session_lifetime: 168,
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
        mode: "persistent" as const,
      },
      error_page: {
        html: "<html><body>Error</body></html>",
        show_log_link: true,
      },
    };

    const updateResponse = await managementClient.tenants.settings.$patch(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: settingsData,
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();

    // Verify all fields are properly stored and retrieved
    expect(updated.friendly_name).toBe("Complete Test");
    expect(updated.picture_url).toBe("https://example.com/logo.png");
    expect(updated.support_email).toBe("support@example.com");
    expect(updated.support_url).toBe("https://example.com/support");
    expect(updated.idle_session_lifetime).toBe(72);
    expect(updated.session_lifetime).toBe(168);
    expect(updated.default_redirection_uri).toBe(
      "https://example.com/callback",
    );
    expect(updated.enabled_locales).toEqual(["en", "es"]);
    expect(updated.default_directory).toBe("Username-Password-Authentication");
    expect(updated.default_audience).toBe("https://api.example.com");
    expect(updated.default_organization).toBe("org_123");
    expect(updated.flags).toEqual({
      enable_client_connections: true,
      enable_pipeline2: true,
      enable_dynamic_client_registration: false,
    });
    expect(updated.session_cookie).toEqual({ mode: "persistent" });
    expect(updated.error_page).toEqual({
      html: "<html><body>Error</body></html>",
      show_log_link: true,
    });
  });

  it("should handle change password settings", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const settingsData = {
      change_password: {
        enabled: true,
        html: "<html><body>Change Password Page</body></html>",
      },
    };

    const updateResponse = await managementClient.tenants.settings.$patch(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: settingsData,
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.change_password).toEqual({
      enabled: true,
      html: "<html><body>Change Password Page</body></html>",
    });
  });

  it("should handle guardian MFA page settings", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const settingsData = {
      guardian_mfa_page: {
        enabled: true,
        html: "<html><body>MFA Page</body></html>",
      },
    };

    const updateResponse = await managementClient.tenants.settings.$patch(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: settingsData,
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.guardian_mfa_page).toEqual({
      enabled: true,
      html: "<html><body>MFA Page</body></html>",
    });
  });

  it("should handle sessions settings", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const settingsData = {
      sessions: {
        oidc_logout_prompt_enabled: true,
      },
    };

    const updateResponse = await managementClient.tenants.settings.$patch(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: settingsData,
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.sessions).toEqual({
      oidc_logout_prompt_enabled: true,
    });
  });

  it("should handle sandbox version settings", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const settingsData = {
      sandbox_version: "12",
      sandbox_versions_available: ["8", "12", "16", "18"],
    };

    const updateResponse = await managementClient.tenants.settings.$patch(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: settingsData,
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.sandbox_version).toBe("12");
    expect(updated.sandbox_versions_available).toEqual(["8", "12", "16", "18"]);
  });
});
