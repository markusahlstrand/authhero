import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { LogTypes, Strategy } from "@authhero/adapter-interfaces";
import { USERNAME_PASSWORD_PROVIDER } from "../../../src/constants";

describe("GET /users/{user_id}/logs", () => {
  it("returns logs for the primary user and all linked secondaries", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const primaryId = `${USERNAME_PASSWORD_PROVIDER}|primary-user`;
    const secondaryId = "email|secondary-user";

    await env.data.users.create("tenantId", {
      email: "primary@example.com",
      user_id: primaryId,
      provider: USERNAME_PASSWORD_PROVIDER,
      email_verified: true,
      connection: Strategy.USERNAME_PASSWORD,
      is_social: false,
    });

    await env.data.users.create("tenantId", {
      email: "secondary@example.com",
      user_id: secondaryId,
      provider: "email",
      email_verified: true,
      connection: "email",
      is_social: false,
      linked_to: primaryId,
    });

    await env.data.logs.create("tenantId", {
      type: LogTypes.SUCCESS_LOGIN,
      date: new Date("2026-04-01T00:00:00Z").toISOString(),
      description: "primary login",
      isMobile: false,
      user_id: primaryId,
    });

    await env.data.logs.create("tenantId", {
      type: LogTypes.SUCCESS_LOGIN,
      date: new Date("2026-04-02T00:00:00Z").toISOString(),
      description: "secondary login",
      isMobile: false,
      user_id: secondaryId,
    });

    await env.data.logs.create("tenantId", {
      type: LogTypes.SUCCESS_LOGIN,
      date: new Date("2026-04-03T00:00:00Z").toISOString(),
      description: "unrelated login",
      isMobile: false,
      user_id: "email|other-user",
    });

    const response = await managementClient.users[":user_id"].logs.$get(
      {
        param: { user_id: primaryId },
        query: { include_totals: "true" },
        header: { "tenant-id": "tenantId" },
      },
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    if (Array.isArray(body)) {
      throw new Error("Expected totals body, got array");
    }

    expect(body.length).toBe(2);
    expect(body.logs).toHaveLength(2);

    const userIds = body.logs.map((log) => log.user_id).sort();
    expect(userIds).toEqual([primaryId, secondaryId].sort());
  });

  it("returns 404 when called against a secondary (linked) user", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const primaryId = `${USERNAME_PASSWORD_PROVIDER}|primary-only`;
    const secondaryId = "email|secondary-only";

    await env.data.users.create("tenantId", {
      email: "primary-only@example.com",
      user_id: primaryId,
      provider: USERNAME_PASSWORD_PROVIDER,
      email_verified: true,
      connection: Strategy.USERNAME_PASSWORD,
      is_social: false,
    });

    await env.data.users.create("tenantId", {
      email: "secondary-only@example.com",
      user_id: secondaryId,
      provider: "email",
      email_verified: true,
      connection: "email",
      is_social: false,
      linked_to: primaryId,
    });

    const response = await managementClient.users[":user_id"].logs.$get(
      {
        param: { user_id: secondaryId },
        query: {},
        header: { "tenant-id": "tenantId" },
      },
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the user does not exist", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await managementClient.users[":user_id"].logs.$get(
      {
        param: { user_id: "email|nope" },
        query: {},
        header: { "tenant-id": "tenantId" },
      },
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );

    expect(response.status).toBe(404);
  });
});
