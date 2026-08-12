import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../helpers/test-server";
import { createSessions } from "../helpers/create-session";
import {
  formatRefreshToken,
  generateRefreshTokenParts,
  hashRefreshTokenSecret,
} from "../../src/utils/refresh-token-format";
import { ulid } from "../../src/utils/ulid";
import {
  shouldStampUsedAt,
  SESSION_USED_AT_THROTTLE_MS,
} from "../../src/helpers/session-usage";

const HOUR = 60 * 60 * 1000;

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

async function seedRefreshToken(
  env: Awaited<ReturnType<typeof getTestServer>>["env"],
  loginSessionId: string,
) {
  const id = ulid();
  const { lookup, secret } = generateRefreshTokenParts();
  await env.data.refreshTokens.create("tenantId", {
    id,
    login_id: loginSessionId,
    user_id: "email|userId",
    client_id: "clientId",
    resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
    device: {
      last_ip: "",
      initial_ip: "",
      last_user_agent: "",
      initial_user_agent: "",
      initial_asn: "",
      last_asn: "",
    },
    rotating: true,
    token_lookup: lookup,
    token_hash: await hashRefreshTokenSecret(secret),
    family_id: id,
    expires_at: iso(HOUR),
    idle_expires_at: iso(HOUR),
  });
  return formatRefreshToken(lookup, secret);
}

describe("shouldStampUsedAt", () => {
  const now = Date.now();

  it("skips a session stamped inside the throttle window", () => {
    expect(
      shouldStampUsedAt(
        { used_at: iso(-60_000), created_at: iso(-30 * 24 * HOUR) },
        now,
      ),
    ).toBe(false);
  });

  it("stamps a session whose used_at has gone stale", () => {
    expect(
      shouldStampUsedAt(
        {
          used_at: new Date(
            now - SESSION_USED_AT_THROTTLE_MS - 1000,
          ).toISOString(),
          created_at: iso(-30 * 24 * HOUR),
        },
        now,
      ),
    ).toBe(true);
  });

  it("falls back to created_at when used_at was never set", () => {
    // Freshly created — already counted in the current week, nothing to record.
    expect(
      shouldStampUsedAt({ used_at: undefined, created_at: iso(-60_000) }, now),
    ).toBe(false);
    // Created long ago and never stamped — this is the case that leaves
    // retention cohorts flat, so it must stamp.
    expect(
      shouldStampUsedAt(
        { used_at: undefined, created_at: iso(-30 * 24 * HOUR) },
        now,
      ),
    ).toBe(true);
  });

  it("stamps when the timestamps are missing or unparseable", () => {
    expect(shouldStampUsedAt({ used_at: undefined, created_at: "" }, now)).toBe(
      true,
    );
    expect(
      shouldStampUsedAt({ used_at: "not-a-date", created_at: "" }, now),
    ).toBe(true);
  });
});

describe("refresh token exchange stamps session usage", () => {
  it("bumps used_at on a session that has gone stale", async () => {
    const { oauthApp, env } = await getTestServer();
    const { loginSession, session } = await createSessions(env.data);

    // Push the session's usage stamp outside the throttle window, as it would
    // be for a client that has been refreshing quietly for weeks.
    const staleUsedAt = new Date(
      Date.now() - SESSION_USED_AT_THROTTLE_MS - 60_000,
    ).toISOString();
    await env.data.sessions.update("tenantId", session.id, {
      used_at: staleUsedAt,
    });

    const wire = await seedRefreshToken(env, loginSession.id);
    const client = testClient(oauthApp, env);

    const response = await client.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: wire,
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(response.status).toBe(200);

    const updated = await env.data.sessions.get("tenantId", session.id);
    expect(updated?.used_at).toBeTypeOf("string");
    expect(new Date(updated!.used_at!).getTime()).toBeGreaterThan(
      new Date(staleUsedAt).getTime(),
    );
  });

  it("leaves a recently stamped session alone", async () => {
    const { oauthApp, env } = await getTestServer();
    const { loginSession, session } = await createSessions(env.data);

    const freshUsedAt = new Date(Date.now() - 60_000).toISOString();
    await env.data.sessions.update("tenantId", session.id, {
      used_at: freshUsedAt,
    });

    const wire = await seedRefreshToken(env, loginSession.id);
    const client = testClient(oauthApp, env);

    const response = await client.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: wire,
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(response.status).toBe(200);

    const updated = await env.data.sessions.get("tenantId", session.id);
    expect(updated?.used_at).toBe(freshUsedAt);
  });
});
