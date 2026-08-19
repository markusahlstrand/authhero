import { describe, it, expect } from "vitest";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";
import {
  getAvatarInitials,
  getDefaultUserPicture,
} from "../../src/helpers/avatar";

const CONNECTION = "Username-Password-Authentication";

async function createUser(body: Record<string, unknown>) {
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
      body: JSON.stringify({ connection: CONNECTION, ...body }),
    },
    env,
  );
  return { response, managementApp, env, token };
}

describe("username validation (Auth0 parity)", () => {
  it("rejects an emoji username with a 400 instead of crashing", async () => {
    const { response } = await createUser({ username: "1Muse 😈" });
    expect(response.status).toBe(400);
  });

  it("rejects a username containing a space", async () => {
    const { response } = await createUser({ username: "first last" });
    expect(response.status).toBe(400);
  });

  it("rejects an accented character, matching Auth0's alphanumeric rule", async () => {
    const { response } = await createUser({ username: "josé" });
    expect(response.status).toBe(400);
  });

  it("rejects a username over the connection's max length", async () => {
    const { response } = await createUser({ username: "a".repeat(16) });
    expect(response.status).toBe(400);
  });

  it("accepts Auth0's allowed punctuation set", async () => {
    const { response } = await createUser({ username: "a_b+c-d.e!f#g" });
    expect(response.status).toBe(201);
  });

  it("lowercases the username on write, like Auth0", async () => {
    const { response } = await createUser({ username: "MixedCase" });
    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.username).toBe("mixedcase");
  });

  it("rejects an emoji username on PATCH too", async () => {
    const { response, managementApp, env, token } = await createUser({
      username: "patchme",
    });
    expect(response.status).toBe(201);
    const created = await response.json();

    const patch = await managementApp.request(
      `/users/${encodeURIComponent(created.user_id)}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        body: JSON.stringify({ username: "1Muse 😈" }),
      },
      env,
    );
    expect(patch.status).toBe(400);
  });
});

describe("avatar generation is surrogate-safe", () => {
  // Regression: `name` is free-form profile data (Auth0 allows emoji there),
  // so username validation alone does not prevent an astral character from
  // reaching the avatar URL builder. Splitting the surrogate pair produced a
  // lone surrogate and `encodeURIComponent` threw URIError -> 500.
  it("does not throw for a display name ending in an emoji", () => {
    expect(() =>
      getDefaultUserPicture("https://example.com/", { name: "1Muse 😈" }),
    ).not.toThrow();
  });

  it("keeps the emoji whole rather than emitting half a surrogate pair", () => {
    const initials = getAvatarInitials({ name: "1Muse 😈" });
    for (const unit of initials) {
      const code = unit.charCodeAt(0);
      expect(code >= 0xd800 && code <= 0xdfff && initials.length === 1).toBe(
        false,
      );
    }
    expect(() => encodeURIComponent(initials)).not.toThrow();
  });

  it("handles a single-word name that starts with an emoji", () => {
    expect(() =>
      getDefaultUserPicture("https://example.com/", { name: "😈x" }),
    ).not.toThrow();
  });

  it("still renders a legacy row whose username was stored before validation", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    // Written straight through the adapter, as a pre-validation or
    // bulk-imported row would have been.
    const legacy = await env.data.users.create("tenantId", {
      user_id: "auth2|legacy-emoji",
      email: undefined,
      username: "1Muse 😈",
      provider: "auth2",
      connection: CONNECTION,
      email_verified: false,
      is_social: false,
    });

    const response = await managementApp.request(
      `/users/${encodeURIComponent(legacy.user_id)}`,
      {
        headers: { authorization: `Bearer ${token}`, "tenant-id": "tenantId" },
      },
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.username).toBe("1Muse 😈");
    expect(body.picture).toBeTruthy();
  });
});
