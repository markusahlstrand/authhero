import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

describe("emailProviders", () => {
  it("should set and get a email provider", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // Delete the default email provider created by test setup
    await env.data.emailProviders.remove("tenantId");

    // Check that we get a 404 when no email provider is set
    const emptyEmailProviderResponse =
      await managementClient.email.providers.$get(
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
    expect(emptyEmailProviderResponse.status).toBe(404);

    // Set the email provider
    const createEmailProviderResponse =
      await managementClient.email.providers.$post(
        {
          header: {
            "tenant-id": "tenantId",
          },
          json: {
            name: "sendgrid",
            credentials: {
              api_key: "apiKey",
            },
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

    expect(createEmailProviderResponse.status).toBe(201);

    // Update the provider
    const updateEmailProviderResponse =
      await managementClient.email.providers.$patch(
        {
          header: {
            "tenant-id": "tenantId",
          },
          json: {
            name: "mailgun",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

    expect(updateEmailProviderResponse.status).toBe(200);

    // Get the email provider
    const emailProviderResponse = await managementClient.email.providers.$get(
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

    expect(emailProviderResponse.status).toBe(200);
    const emailProvider = await emailProviderResponse.json();

    expect(emailProvider).toMatchObject({
      name: "mailgun",
      enabled: true,
      credentials: {
        api_key: "apiKey",
      },
    });
  });
});
