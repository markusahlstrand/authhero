import { describe, it, expect } from "vitest";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";

describe("POST /api/v2/users", () => {
  it("returns 400 rather than 500 when the request has no body or content-type", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    // A bodyless POST used to bypass the zod validator entirely (the body was
    // not marked `required`), so the handler ran with `{}` and only failed at
    // the database layer, surfacing as a generic 500.
    const response = await managementApp.request(
      "/users",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when a required field is missing from the body", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const response = await managementApp.request(
      "/users",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        // `connection` is required by userInsertSchema.
        body: JSON.stringify({ email: "no-connection@example.com" }),
      },
      env,
    );

    expect(response.status).toBe(400);
  });

  it("still creates a user when given a valid body", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const response = await managementApp.request(
      "/users",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "valid-body@example.com",
          connection: "Username-Password-Authentication",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ email: "valid-body@example.com" });
  });
});

describe("PATCH /api/v2/users/:user_id phone_number uniqueness", () => {
  const PHONE = "+46700000001";

  async function patchPhone(
    managementApp: Awaited<ReturnType<typeof getTestServer>>["managementApp"],
    env: Awaited<ReturnType<typeof getTestServer>>["env"],
    userId: string,
    phone_number: string,
  ) {
    const token = await getAdminToken();
    return managementApp.request(
      `/users/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        body: JSON.stringify({ phone_number }),
      },
      env,
    );
  }

  it("allows a non-sms user to take a phone number another non-sms user already has", async () => {
    const { managementApp, env } = await getTestServer();

    // Placeholder/dummy numbers on email-provider users are ordinary profile
    // data, not identities — production carries thousands of them (#1166).
    // The old unscoped check 409'd on these, blocking legitimate updates.
    await env.data.users.create("tenantId", {
      user_id: "auth2|other-email-user",
      email: "other@example.com",
      email_verified: true,
      phone_number: PHONE,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
    });
    await env.data.users.create("tenantId", {
      user_id: "auth2|target-email-user",
      email: "target@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
    });

    const response = await patchPhone(
      managementApp,
      env,
      "auth2|target-email-user",
      PHONE,
    );

    expect(response.status).toBe(200);
  });

  it("allows a non-sms user to take a phone number an sms user identifies by", async () => {
    const { managementApp, env } = await getTestServer();

    await env.data.users.create("tenantId", {
      user_id: "sms|sms-user",
      phone_number: PHONE,
      email_verified: false,
      provider: "sms",
      connection: "sms",
      is_social: false,
    });
    await env.data.users.create("tenantId", {
      user_id: "auth2|profile-user",
      email: "profile@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
    });

    // The sms user's phone is their identity, but that does not stop an
    // unrelated user recording the same number as profile data.
    const response = await patchPhone(
      managementApp,
      env,
      "auth2|profile-user",
      PHONE,
    );

    expect(response.status).toBe(200);
  });

  it("still rejects an sms user taking a phone number another sms user identifies by", async () => {
    const { managementApp, env } = await getTestServer();

    await env.data.users.create("tenantId", {
      user_id: "sms|incumbent",
      phone_number: PHONE,
      email_verified: false,
      provider: "sms",
      connection: "sms",
      is_social: false,
    });
    await env.data.users.create("tenantId", {
      user_id: "sms|challenger",
      phone_number: "+46700000002",
      email_verified: false,
      provider: "sms",
      connection: "sms",
      is_social: false,
    });

    const response = await patchPhone(
      managementApp,
      env,
      "sms|challenger",
      PHONE,
    );

    expect(response.status).toBe(409);
  });

  it("lets an sms user keep a phone number that only they hold", async () => {
    const { managementApp, env } = await getTestServer();

    await env.data.users.create("tenantId", {
      user_id: "sms|sole-holder",
      phone_number: "+46700000003",
      email_verified: false,
      provider: "sms",
      connection: "sms",
      is_social: false,
    });

    const response = await patchPhone(
      managementApp,
      env,
      "sms|sole-holder",
      PHONE,
    );

    expect(response.status).toBe(200);
  });
});
