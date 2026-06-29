import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import {
  AuthorizationResponseType,
  LogTypes,
  Strategy,
} from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";

const TENANT_ID = "tenantId";
const CLIENT_ID = "clientId";
const REALM = Strategy.USERNAME_PASSWORD;
const UPSTREAM_DOMAIN = "https://upstream.example.auth0.com";
const UPSTREAM_TOKEN_ENDPOINT = `${UPSTREAM_DOMAIN}/oauth/token`;
const UPSTREAM_USERINFO_ENDPOINT = `${UPSTREAM_DOMAIN}/userinfo`;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface MigrationServerOptions {
  importModeOnDb?: boolean;
  withConfiguration?: boolean;
}

async function makeMigrationServer(options: MigrationServerOptions = {}) {
  const { importModeOnDb = true, withConfiguration = true } = options;
  const server = await getTestServer();
  const { env } = server;

  // The DB connection holds both the `import_mode` flag and the upstream
  // credentials under `options.configuration` (Auth0-faithful shape).
  // The default fixture creates the DB connection with the wrong strategy
  // value ("auth2" — the legacy provider value). Force-update it to the
  // real strategy with the migration options inline so the code path is
  // exercised.
  const dbOptions: Record<string, unknown> = { import_mode: importModeOnDb };
  if (withConfiguration) {
    dbOptions.configuration = {
      client_id: "upstream-cid",
      client_secret: "upstream-csecret",
      token_endpoint: UPSTREAM_TOKEN_ENDPOINT,
      userinfo_endpoint: UPSTREAM_USERINFO_ENDPOINT,
    };
  }
  await env.data.connections.update(
    TENANT_ID,
    "Username-Password-Authentication",
    {
      strategy: Strategy.USERNAME_PASSWORD,
      options: dbOptions,
    },
  );

  return server;
}

describe("auth0 migration: password fallback", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a local user + password on first login when upstream accepts", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "upstream-at",
          id_token: "upstream-it",
          token_type: "Bearer",
          expires_in: 86400,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          sub: "auth0|migrated-1",
          email: "migrated@example.com",
          email_verified: true,
          name: "Migrated User",
          given_name: "Migrated",
          family_name: "User",
        }),
      );

    const { oauthApp, env } = await makeMigrationServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.co.authenticate.$post({
      json: {
        client_id: CLIENT_ID,
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: REALM,
        username: "migrated@example.com",
        password: "UpstreamPassword!",
      },
    });

    expect(response.status).toBe(200);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0];
    expect(tokenUrl).toBe(UPSTREAM_TOKEN_ENDPOINT);
    const tokenBody = new URLSearchParams(tokenInit.body);
    expect(tokenBody.get("grant_type")).toBe(
      "http://auth0.com/oauth/grant-type/password-realm",
    );
    expect(tokenBody.get("realm")).toBe(REALM);
    expect(tokenBody.get("username")).toBe("migrated@example.com");
    expect(tokenBody.get("client_id")).toBe("upstream-cid");

    const [userinfoUrl, userinfoInit] = fetchSpy.mock.calls[1];
    expect(userinfoUrl).toBe(UPSTREAM_USERINFO_ENDPOINT);
    expect(userinfoInit.headers.authorization).toBe("Bearer upstream-at");

    const { users } = await env.data.users.list(TENANT_ID, {
      page: 0,
      per_page: 10,
      include_totals: false,
      q: "email:migrated@example.com",
    });
    const migratedUser = users.find(
      (u) => u.connection === Strategy.USERNAME_PASSWORD,
    );
    expect(migratedUser).toBeDefined();
    expect(migratedUser?.email).toBe("migrated@example.com");
    expect(migratedUser?.given_name).toBe("Migrated");

    const passwordRow = await env.data.passwords.get(
      TENANT_ID,
      migratedUser!.user_id,
    );
    expect(passwordRow).toBeDefined();
    expect(
      await bcryptjs.compare("UpstreamPassword!", passwordRow!.password),
    ).toBe(true);

    const { logs } = await env.data.logs.list(TENANT_ID, {
      page: 0,
      per_page: 100,
      include_totals: false,
    });
    const migrationLog = logs.find(
      (log) => log.type === LogTypes.SUCCESS_PASSWORD_MIGRATION,
    );
    expect(migrationLog).toBeDefined();
    expect(migrationLog?.user_id).toBe(migratedUser!.user_id);
    expect(migrationLog?.connection).toBe(Strategy.USERNAME_PASSWORD);
    // The raw password must never appear in any log field.
    const serialised = JSON.stringify(logs);
    expect(serialised).not.toContain("UpstreamPassword!");
  });

  it("serves the second login entirely locally (no upstream calls)", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "upstream-at",
          token_type: "Bearer",
          expires_in: 86400,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          sub: "auth0|migrated-2",
          email: "second@example.com",
          email_verified: true,
        }),
      );

    const { oauthApp, env } = await makeMigrationServer();
    const oauthClient = testClient(oauthApp, env);

    const first = await oauthClient.co.authenticate.$post({
      json: {
        client_id: CLIENT_ID,
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: REALM,
        username: "second@example.com",
        password: "Pwd1!",
      },
    });
    expect(first.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const second = await oauthClient.co.authenticate.$post({
      json: {
        client_id: CLIENT_ID,
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: REALM,
        username: "second@example.com",
        password: "Pwd1!",
      },
    });
    expect(second.status).toBe(200);
    // Still 2 — no further upstream call on the second login.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("rejects with INVALID_PASSWORD when upstream rejects credentials", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(403, {
        error: "invalid_grant",
        error_description: "Wrong email or password.",
      }),
    );

    const { oauthApp, env } = await makeMigrationServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.co.authenticate.$post({
      json: {
        client_id: CLIENT_ID,
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: REALM,
        username: "nobody@example.com",
        password: "wrong",
      },
    });

    expect(response.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const { users } = await env.data.users.list(TENANT_ID, {
      page: 0,
      per_page: 10,
      include_totals: false,
      q: "email:nobody@example.com",
    });
    expect(users).toHaveLength(0);
  });

  it("does NOT call upstream when DB connection has import_mode=false", async () => {
    const { oauthApp, env } = await makeMigrationServer({
      importModeOnDb: false,
    });
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.co.authenticate.$post({
      json: {
        client_id: CLIENT_ID,
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: REALM,
        username: "nobody@example.com",
        password: "anything",
      },
    });

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does NOT call upstream when DB connection has no options.configuration", async () => {
    const { oauthApp, env } = await makeMigrationServer({
      withConfiguration: false,
    });
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.co.authenticate.$post({
      json: {
        client_id: CLIENT_ID,
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: REALM,
        username: "nobody@example.com",
        password: "anything",
      },
    });

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("migrates an existing local user (created without a password) on first login", async () => {
    const { oauthApp, env } = await makeMigrationServer();

    await env.data.users.create(TENANT_ID, {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|preexisting`,
      email: "preexisting@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      is_social: false,
    });

    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "upstream-at",
          token_type: "Bearer",
          expires_in: 86400,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          sub: "auth0|preexisting",
          email: "preexisting@example.com",
          email_verified: true,
        }),
      );

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.co.authenticate.$post({
      json: {
        client_id: CLIENT_ID,
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: REALM,
        username: "preexisting@example.com",
        password: "Pwd1!",
      },
    });

    expect(response.status).toBe(200);

    const passwordRow = await env.data.passwords.get(
      TENANT_ID,
      `${USERNAME_PASSWORD_PROVIDER}|preexisting`,
    );
    expect(passwordRow).toBeDefined();
    expect(await bcryptjs.compare("Pwd1!", passwordRow!.password)).toBe(true);

    const { logs } = await env.data.logs.list(TENANT_ID, {
      page: 0,
      per_page: 100,
      include_totals: false,
    });
    const migrationLog = logs.find(
      (log) => log.type === LogTypes.SUCCESS_PASSWORD_MIGRATION,
    );
    expect(migrationLog).toBeDefined();
    expect(migrationLog?.user_id).toBe(
      `${USERNAME_PASSWORD_PROVIDER}|preexisting`,
    );
  });

  it("does NOT emit SUCCESS_PASSWORD_MIGRATION when upstream rejects", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(403, {
        error: "invalid_grant",
        error_description: "Wrong email or password.",
      }),
    );

    const { oauthApp, env } = await makeMigrationServer();
    const oauthClient = testClient(oauthApp, env);

    await oauthClient.co.authenticate.$post({
      json: {
        client_id: CLIENT_ID,
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: REALM,
        username: "nobody@example.com",
        password: "wrong",
      },
    });

    const { logs } = await env.data.logs.list(TENANT_ID, {
      page: 0,
      per_page: 100,
      include_totals: false,
    });
    const migrationLog = logs.find(
      (log) => log.type === LogTypes.SUCCESS_PASSWORD_MIGRATION,
    );
    expect(migrationLog).toBeUndefined();
  });

  // Regression: universal-login enter-password defaults `realm` to the
  // `USERNAME_PASSWORD` strategy literal. When the tenant's DB connection is
  // named something other than that literal (e.g. "Password"), the
  // `findConnectionByName(name=realm)` lookup misses and lazy migration is
  // silently skipped — leaving the user with an "Invalid user" 400 instead of
  // a successful upstream verification.
  it("falls back to client.connections-by-strategy when DB connection name differs from the strategy literal", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "upstream-at",
          token_type: "Bearer",
          expires_in: 86400,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          sub: "auth0|named-1",
          email: "renamed@example.com",
          email_verified: true,
        }),
      );

    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Start the OAuth flow before restricting connections so the
    // single-connection auto-redirect path doesn't trip on /authorize.
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: CLIENT_ID,
        redirect_uri: "https://example.com/callback",
        state: "state",
        nonce: "nonce",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });
    expect(authorizeResponse.status).toBe(302);
    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${location}`);
    const state = universalUrl.searchParams.get("state");
    if (!state) {
      throw new Error("No state found");
    }

    // Rename the seed connection so its `name` no longer matches the
    // strategy literal. Mirrors the real-world tenant config from the bug
    // report: id "Username-Password-Authentication" but name "Password".
    await env.data.connections.update(
      TENANT_ID,
      "Username-Password-Authentication",
      {
        name: "Password",
        strategy: Strategy.USERNAME_PASSWORD,
        options: {
          import_mode: true,
          disable_signup: true,
          configuration: {
            client_id: "upstream-cid",
            client_secret: "upstream-csecret",
            token_endpoint: UPSTREAM_TOKEN_ENDPOINT,
            userinfo_endpoint: UPSTREAM_USERINFO_ENDPOINT,
          },
        },
      },
    );

    // Scope the client to just the renamed password connection so the
    // identifier step's lazy-migration gate is exercised end-to-end.
    await env.data.clientConnections.updateByClient(TENANT_ID, CLIENT_ID, [
      "Username-Password-Authentication",
    ]);

    const identifierResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "renamed@example.com" },
    });
    expect(identifierResponse.status).toBe(302);
    expect(identifierResponse.headers.get("location")).toContain(
      "/u/enter-password",
    );

    const enterPasswordResponse = await universalClient["enter-password"].$post(
      {
        query: { state },
        form: { password: "UpstreamPassword!" },
      },
    );

    // Upstream must have been called (token + userinfo); the response must
    // be a successful 302 back to the OAuth callback rather than the
    // "Invalid user" re-render.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(enterPasswordResponse.status).toBe(302);
    const callback = enterPasswordResponse.headers.get("location");
    expect(callback).toContain("https://example.com/callback");

    // The local user was created with the connection's `name` ("Password"),
    // and a password row exists.
    const { users } = await env.data.users.list(TENANT_ID, {
      page: 0,
      per_page: 10,
      include_totals: false,
      q: "email:renamed@example.com",
    });
    const migratedUser = users.find((u) => u.connection === "Password");
    expect(migratedUser).toBeDefined();
    const passwordRow = await env.data.passwords.get(
      TENANT_ID,
      migratedUser!.user_id,
    );
    expect(passwordRow).toBeDefined();
    expect(
      await bcryptjs.compare("UpstreamPassword!", passwordRow!.password),
    ).toBe(true);
  });

  // Same renamed-connection setup, but the local user already exists (no
  // password row yet). password.ts's second fallback path
  // (findConnectionByName(user.connection)) keys off the user's stored
  // connection name — verify it still hits upstream and stores the bcrypt
  // hash locally.
  it("hits upstream for an existing local user without a password row (renamed connection)", async () => {
    // Only the token endpoint is fetched — when the user already exists
    // locally, attemptUpstreamPasswordFallback skips the userinfo lookup.
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: "upstream-at",
        token_type: "Bearer",
        expires_in: 86400,
      }),
    );

    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Seed state BEFORE /authorize so we still hit the raw data adapter —
    // the auth-api middleware mutates ctx.env.data on the first request, and
    // after that env.data.users.create would re-trigger preUserSignupHook
    // (which would reject this seed user under disable_signup).
    await env.data.connections.update(
      TENANT_ID,
      "Username-Password-Authentication",
      {
        name: "Password",
        strategy: Strategy.USERNAME_PASSWORD,
        options: {
          import_mode: true,
          disable_signup: true,
          configuration: {
            client_id: "upstream-cid",
            client_secret: "upstream-csecret",
            token_endpoint: UPSTREAM_TOKEN_ENDPOINT,
            userinfo_endpoint: UPSTREAM_USERINFO_ENDPOINT,
          },
        },
      },
    );
    await env.data.clientConnections.updateByClient(TENANT_ID, CLIENT_ID, [
      "Username-Password-Authentication",
    ]);

    // Pre-seed the user *without* a password row. `connection` matches the
    // renamed connection's name so the second-fallback lookup in
    // password.ts resolves it.
    const existingUserId = `${USERNAME_PASSWORD_PROVIDER}|renamed-existing`;
    await env.data.users.create(TENANT_ID, {
      user_id: existingUserId,
      email: "preexisting-renamed@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: "Password",
      is_social: false,
    });

    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: CLIENT_ID,
        redirect_uri: "https://example.com/callback",
        state: "state",
        nonce: "nonce",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });
    expect(authorizeResponse.status).toBe(302);
    const universalUrl = new URL(
      `https://example.com${authorizeResponse.headers.get("location")}`,
    );
    const state = universalUrl.searchParams.get("state");
    if (!state) {
      throw new Error("No state found");
    }

    const identifierResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "preexisting-renamed@example.com" },
    });
    expect(identifierResponse.status).toBe(302);

    const enterPasswordResponse = await universalClient["enter-password"].$post(
      {
        query: { state },
        form: { password: "UpstreamPassword!" },
      },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [tokenUrl] = fetchSpy.mock.calls[0];
    expect(tokenUrl).toBe(UPSTREAM_TOKEN_ENDPOINT);
    expect(enterPasswordResponse.status).toBe(302);
    expect(enterPasswordResponse.headers.get("location")).toContain(
      "https://example.com/callback",
    );

    const passwordRow = await env.data.passwords.get(TENANT_ID, existingUserId);
    expect(passwordRow).toBeDefined();
    expect(
      await bcryptjs.compare("UpstreamPassword!", passwordRow!.password),
    ).toBe(true);
  });

  // Faithful repro of the reported prod case: a user imported with
  // provider "auth0", connection "Username-Password-Authentication" (the
  // DEFAULT name, matching the import_mode connection), and NO password row.
  // Connection name matches user.connection here, so this isolates whether
  // provider "auth0" alone breaks the Stage 2 fallback.
  it("repro: imported auth0-provider passwordless user hits upstream fallback (default connection name)", async () => {
    const { oauthApp, env } = await makeMigrationServer();

    await env.data.users.create(TENANT_ID, {
      user_id: "auth0|Eo4KYjjnM-Sze2wQVyXye",
      email: "marcuslowe2000@gmail.com",
      email_verified: false,
      provider: "auth0",
      connection: "Username-Password-Authentication",
      is_social: false,
    });

    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: "upstream-at",
        token_type: "Bearer",
        expires_in: 86400,
      }),
    );

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.co.authenticate.$post({
      json: {
        client_id: CLIENT_ID,
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: REALM,
        username: "marcuslowe2000@gmail.com",
        password: "UpstreamPassword!",
      },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);

    const passwordRow = await env.data.passwords.get(
      TENANT_ID,
      "auth0|Eo4KYjjnM-Sze2wQVyXye",
    );
    expect(passwordRow).toBeDefined();
  });

  // Local password row already exists and matches: the local check succeeds
  // and we must NOT call upstream — the bcrypt path is the source of truth
  // once migration has happened.
  it("does NOT call upstream when the local password row is valid (renamed connection)", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    // Seed state BEFORE /authorize so we still hit the raw data adapter
    // (see note in the previous test).
    await env.data.connections.update(
      TENANT_ID,
      "Username-Password-Authentication",
      {
        name: "Password",
        strategy: Strategy.USERNAME_PASSWORD,
        options: {
          import_mode: true,
          disable_signup: true,
          configuration: {
            client_id: "upstream-cid",
            client_secret: "upstream-csecret",
            token_endpoint: UPSTREAM_TOKEN_ENDPOINT,
            userinfo_endpoint: UPSTREAM_USERINFO_ENDPOINT,
          },
        },
      },
    );
    await env.data.clientConnections.updateByClient(TENANT_ID, CLIENT_ID, [
      "Username-Password-Authentication",
    ]);

    // Pre-seed the user with a valid local password row.
    const existingUserId = `${USERNAME_PASSWORD_PROVIDER}|renamed-local`;
    await env.data.users.create(TENANT_ID, {
      user_id: existingUserId,
      email: "local-renamed@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: "Password",
      is_social: false,
    });
    await env.data.passwords.create(TENANT_ID, {
      user_id: existingUserId,
      password: await bcryptjs.hash("LocalPwd!", 10),
      algorithm: "bcrypt",
    });

    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: CLIENT_ID,
        redirect_uri: "https://example.com/callback",
        state: "state",
        nonce: "nonce",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });
    expect(authorizeResponse.status).toBe(302);
    const universalUrl = new URL(
      `https://example.com${authorizeResponse.headers.get("location")}`,
    );
    const state = universalUrl.searchParams.get("state");
    if (!state) {
      throw new Error("No state found");
    }

    const identifierResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "local-renamed@example.com" },
    });
    expect(identifierResponse.status).toBe(302);

    const enterPasswordResponse = await universalClient["enter-password"].$post(
      {
        query: { state },
        form: { password: "LocalPwd!" },
      },
    );

    // Logged in via the local password row — no upstream calls.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(enterPasswordResponse.status).toBe(302);
    expect(enterPasswordResponse.headers.get("location")).toContain(
      "https://example.com/callback",
    );
  });
});
