import { describe, it, expect } from "vitest";
import {
  getUsernamePasswordUser,
  isUsernamePasswordProvider,
  resolveUsernamePasswordProvider,
} from "../../src/utils/username-password-provider";
import { getTestServer } from "../helpers/test-server";

describe("isUsernamePasswordProvider", () => {
  it("matches both legacy auth2 and target auth0 values", () => {
    expect(isUsernamePasswordProvider("auth2")).toBe(true);
    expect(isUsernamePasswordProvider("auth0")).toBe(true);
  });

  it("rejects unrelated providers and missing values", () => {
    expect(isUsernamePasswordProvider("email")).toBe(false);
    expect(isUsernamePasswordProvider("sms")).toBe(false);
    expect(isUsernamePasswordProvider("google-oauth2")).toBe(false);
    expect(isUsernamePasswordProvider(undefined)).toBe(false);
    expect(isUsernamePasswordProvider(null)).toBe(false);
  });
});

describe("resolveUsernamePasswordProvider", () => {
  it("defaults to auth0 when no resolver is configured", async () => {
    const { env } = await getTestServer();
    expect(await resolveUsernamePasswordProvider(env, "tenantId")).toBe(
      "auth0",
    );
  });

  it("returns auth0 for tenants matched by the resolver", async () => {
    const { env } = await getTestServer({
      usernamePasswordProvider: ({ tenant_id }) =>
        tenant_id === "tenantId" ? "auth0" : "auth2",
    });
    expect(await resolveUsernamePasswordProvider(env, "tenantId")).toBe(
      "auth0",
    );
    expect(await resolveUsernamePasswordProvider(env, "other")).toBe("auth2");
  });
});

describe("getUsernamePasswordUser dual-read", () => {
  it("finds an auth2 user even when the tenant is now configured for auth0", async () => {
    const { env } = await getTestServer({
      usernamePasswordProvider: () => "auth0",
    });

    // Pretend this row was written before migration.
    await env.data.users.create("tenantId", {
      user_id: "auth2|legacy",
      email: "legacy@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
    });

    const user = await getUsernamePasswordUser({
      env,
      tenant_id: "tenantId",
      username: "legacy@example.com",
    });
    expect(user?.user_id).toBe("auth2|legacy");
  });

  it("finds an auth0 user when the tenant has been migrated", async () => {
    const { env } = await getTestServer({
      usernamePasswordProvider: () => "auth0",
    });

    await env.data.users.create("tenantId", {
      user_id: "auth0|migrated",
      email: "new@example.com",
      email_verified: true,
      provider: "auth0",
      connection: "Username-Password-Authentication",
      is_social: false,
    });

    const user = await getUsernamePasswordUser({
      env,
      tenant_id: "tenantId",
      username: "new@example.com",
    });
    expect(user?.user_id).toBe("auth0|migrated");
  });

  it("prefers the auth2 row when both providers exist for the same email", async () => {
    // Simulates a partial backfill / Auth0 import where the same identifier
    // ended up with rows under both providers. The auth2 row carries the
    // working password, so login must keep finding it.
    const { env } = await getTestServer({
      usernamePasswordProvider: () => "auth0",
    });

    await env.data.users.create("tenantId", {
      user_id: "auth2|legacy-password",
      email: "shared@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
    });
    await env.data.users.create("tenantId", {
      user_id: "auth0|imported",
      email: "shared@example.com",
      email_verified: true,
      provider: "auth0",
      connection: "Username-Password-Authentication",
      is_social: false,
    });

    const user = await getUsernamePasswordUser({
      env,
      tenant_id: "tenantId",
      username: "shared@example.com",
    });
    expect(user?.user_id).toBe("auth2|legacy-password");
  });
});
