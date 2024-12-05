import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

describe("prompts", () => {
  it("should set and get prompts", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const defaultPromptsSettingsResponse = await managementClient.prompts.$get(
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
    expect(defaultPromptsSettingsResponse.status).toBe(200);
    const defalutPromptSetting = await defaultPromptsSettingsResponse.json();

    expect(defalutPromptSetting).toEqual({
      identifier_first: false,
      password_first: false,
      universal_login_experience: "new",
      webauthn_platform_first_factor: false,
    });

    // Update the branding
    const updateBrandingResponse = await managementClient.prompts.$patch(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: {
          identifier_first: false,
          password_first: false,
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
      },
    );

    expect(updateBrandingResponse.status).toBe(200);
    const updateBrandingResponseBody = await updateBrandingResponse.json();
    expect(updateBrandingResponseBody).toEqual({
      identifier_first: false,
      password_first: false,
      universal_login_experience: "new",
      webauthn_platform_first_factor: false,
    });
  });
});
