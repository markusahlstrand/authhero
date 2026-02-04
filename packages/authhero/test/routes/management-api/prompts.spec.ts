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

  it("should set, get, list, and delete custom text", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // ----------------------------------------
    // Get non-existent custom text returns empty object
    // ----------------------------------------
    const emptyResponse = await managementClient.prompts[":prompt"][
      "custom-text"
    ][":language"].$get(
      {
        header: { "tenant-id": "tenantId" },
        param: { prompt: "login", language: "en" },
      },
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );
    expect(emptyResponse.status).toBe(200);
    expect(await emptyResponse.json()).toEqual({});

    // ----------------------------------------
    // Set custom text
    // ----------------------------------------
    const setResponse = await managementClient.prompts[":prompt"]["custom-text"][
      ":language"
    ].$put(
      {
        header: { "tenant-id": "tenantId" },
        param: { prompt: "login", language: "en" },
        json: {
          pageTitle: "Welcome Back",
          buttonText: "Sign In",
          description: "Please enter your credentials",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
      },
    );
    expect(setResponse.status).toBe(200);
    expect(await setResponse.json()).toEqual({
      pageTitle: "Welcome Back",
      buttonText: "Sign In",
      description: "Please enter your credentials",
    });

    // ----------------------------------------
    // Get custom text
    // ----------------------------------------
    const getResponse = await managementClient.prompts[":prompt"]["custom-text"][
      ":language"
    ].$get(
      {
        header: { "tenant-id": "tenantId" },
        param: { prompt: "login", language: "en" },
      },
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual({
      pageTitle: "Welcome Back",
      buttonText: "Sign In",
      description: "Please enter your credentials",
    });

    // ----------------------------------------
    // Set custom text for another language
    // ----------------------------------------
    await managementClient.prompts[":prompt"]["custom-text"][":language"].$put(
      {
        header: { "tenant-id": "tenantId" },
        param: { prompt: "login", language: "de" },
        json: {
          pageTitle: "Willkommen zurück",
          buttonText: "Anmelden",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
      },
    );

    // ----------------------------------------
    // Set custom text for another prompt
    // ----------------------------------------
    await managementClient.prompts[":prompt"]["custom-text"][":language"].$put(
      {
        header: { "tenant-id": "tenantId" },
        param: { prompt: "signup", language: "en" },
        json: {
          pageTitle: "Create Account",
          buttonText: "Sign Up",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
      },
    );

    // ----------------------------------------
    // List all custom text entries
    // ----------------------------------------
    const listResponse =
      await managementClient.prompts["custom-text"].$get(
        {
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
    expect(listResponse.status).toBe(200);
    const entries = await listResponse.json();
    expect(entries).toHaveLength(3);
    expect(entries).toContainEqual({ prompt: "login", language: "en" });
    expect(entries).toContainEqual({ prompt: "login", language: "de" });
    expect(entries).toContainEqual({ prompt: "signup", language: "en" });

    // ----------------------------------------
    // Delete custom text
    // ----------------------------------------
    const deleteResponse = await managementClient.prompts[":prompt"][
      "custom-text"
    ][":language"].$delete(
      {
        header: { "tenant-id": "tenantId" },
        param: { prompt: "login", language: "de" },
      },
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );
    expect(deleteResponse.status).toBe(204);

    // Verify deletion
    const afterDeleteResponse = await managementClient.prompts[":prompt"][
      "custom-text"
    ][":language"].$get(
      {
        header: { "tenant-id": "tenantId" },
        param: { prompt: "login", language: "de" },
      },
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );
    expect(await afterDeleteResponse.json()).toEqual({});

    // Verify list is updated
    const listAfterDeleteResponse =
      await managementClient.prompts["custom-text"].$get(
        {
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
    const entriesAfterDelete = await listAfterDeleteResponse.json();
    expect(entriesAfterDelete).toHaveLength(2);
  });

  it("should validate prompt screen type", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // Try to get custom text with invalid prompt type
    const response = await managementClient.prompts[":prompt"]["custom-text"][
      ":language"
    ].$get(
      {
        header: { "tenant-id": "tenantId" },
        param: { prompt: "invalid-prompt" as any, language: "en" },
      },
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );
    expect(response.status).toBe(400);
  });
});
