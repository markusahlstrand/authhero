import { describe, it, expect } from "vitest";
import {
  LogTypes,
  RateLimitAdapter,
  TokenExchangeProfileInsert,
} from "@authhero/adapter-interfaces";
import { signJWT, parseJWT } from "../../src/utils/jwt";
import { LocalCodeExecutor } from "../../src/hooks/code-executor/local";
import { getTestServer } from "../helpers/test-server";

const TENANT_ID = "tenantId";
const ISSUER = "http://localhost:3000/";
const TOKEN_ENDPOINT = "http://localhost:3000/oauth/token";
const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const SUBJECT_TOKEN_TYPE = "urn:acme:session-token";
const CUSTOMER_ISSUER = "https://app.acme.test";

const CLIENT_ID = "cte-client";
const CLIENT_SECRET = "cte-secret";

type Env = Awaited<ReturnType<typeof getTestServer>>["env"];
type OauthApp = Awaited<ReturnType<typeof getTestServer>>["oauthApp"];

interface TokenBody {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function generateKeypair(kid = "acme-key") {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
      publicExponent: new Uint8Array([1, 0, 1]),
      modulusLength: 2048,
    },
    true,
    ["sign", "verify"],
  );
  const privateKey = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  return {
    privateKey,
    kid,
    jwk: {
      kty: "RSA" as const,
      n: publicJwk.n,
      e: publicJwk.e,
      kid,
      alg: "RS256" as const,
      use: "sig" as const,
    },
  };
}

type Keypair = Awaited<ReturnType<typeof generateKeypair>>;

async function signSubjectToken(
  keypair: Keypair,
  claims: Record<string, unknown> = {},
  options: { expiresInSeconds?: number } = {},
): Promise<string> {
  return signJWT(
    "RS256",
    keypair.privateKey,
    {
      iss: CUSTOMER_ISSUER,
      aud: ISSUER,
      sub: "email|userId",
      jti: crypto.randomUUID(),
      ...claims,
    },
    {
      includeIssuedTimestamp: true,
      expiresInSeconds: options.expiresInSeconds ?? 60,
      headers: { kid: keypair.kid },
    },
  );
}

async function seedClient(
  env: Env,
  overrides: {
    enabled?: boolean;
    is_first_party?: boolean;
    token_endpoint_auth_method?: "none" | "client_secret_post";
  } = {},
) {
  await env.data.clients.create(TENANT_ID, {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    name: "Acme backend",
    callbacks: [],
    allowed_logout_urls: [],
    web_origins: [],
    is_first_party: overrides.is_first_party ?? true,
    token_endpoint_auth_method:
      overrides.token_endpoint_auth_method ?? "client_secret_post",
    token_exchange: {
      allow_any_profile_of_type:
        overrides.enabled === false ? [] : ["custom_authentication"],
    },
  });
}

async function seedJwtProfile(
  env: Env,
  keypair: Keypair,
  jwt: Partial<
    NonNullable<TokenExchangeProfileInsert["jwt_verification"]>
  > = {},
) {
  const profiles = env.data.tokenExchangeProfiles;
  if (!profiles) throw new Error("tokenExchangeProfiles adapter missing");
  return profiles.create(TENANT_ID, {
    name: "Acme sessions",
    subject_token_type: SUBJECT_TOKEN_TYPE,
    type: "custom_authentication",
    jwt_verification: {
      issuer: CUSTOMER_ISSUER,
      jwks: { keys: [keypair.jwk] },
      user_mapping: { type: "user_id" },
      ...jwt,
    },
  });
}

async function exchange(
  oauthApp: OauthApp,
  env: Env,
  form: Record<string, string>,
): Promise<{ status: number; body: TokenBody }> {
  const response = await oauthApp.request(
    "/oauth/token",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "tenant-id": TENANT_ID,
      },
      body: new URLSearchParams({
        grant_type: TOKEN_EXCHANGE_GRANT,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        subject_token_type: SUBJECT_TOKEN_TYPE,
        ...form,
      }).toString(),
    },
    env,
  );
  const body: TokenBody = await response.json();
  return { status: response.status, body };
}

async function logTypes(env: Env): Promise<string[]> {
  const { logs } = await env.data.logs.list(TENANT_ID, { per_page: 100 });
  return logs.map((log) => log.type);
}

describe("custom token exchange with a declarative JWT profile", () => {
  it("issues tokens for an existing user_id", async () => {
    const { oauthApp, env } = await getTestServer();
    const keypair = await generateKeypair();
    await seedClient(env);
    await seedJwtProfile(env, keypair);

    const { status, body } = await exchange(oauthApp, env, {
      subject_token: await signSubjectToken(keypair),
      scope: "openid",
    });

    expect(status).toBe(200);
    const accessToken = parseJWT(body.access_token!);
    expect(accessToken?.payload).toMatchObject({
      sub: "email|userId",
      aud: "https://example.com",
      iss: ISSUER,
    });
    // Authentication, not delegation: no actor claim.
    expect(accessToken?.payload.act).toBeUndefined();
    expect(parseJWT(body.id_token!)?.payload).toMatchObject({
      sub: "email|userId",
      aud: CLIENT_ID,
    });
    expect(await logTypes(env)).toContain(
      LogTypes.SUCCESS_EXCHANGE_CUSTOM_TOKEN,
    );
  });

  it("accepts the token endpoint as the subject token audience", async () => {
    const { oauthApp, env } = await getTestServer();
    const keypair = await generateKeypair();
    await seedClient(env);
    await seedJwtProfile(env, keypair);

    const { status } = await exchange(oauthApp, env, {
      subject_token: await signSubjectToken(keypair, { aud: TOKEN_ENDPOINT }),
    });
    expect(status).toBe(200);
  });

  it.each([
    [
      "a foreign signing key",
      async (k: Keypair) =>
        signSubjectToken({ ...(await generateKeypair()), kid: k.kid }),
    ],
    [
      "a wrong issuer",
      (k: Keypair) => signSubjectToken(k, { iss: "https://evil.test" }),
    ],
    [
      "a wrong audience",
      (k: Keypair) => signSubjectToken(k, { aud: "https://other.test" }),
    ],
    [
      "an expired token",
      (k: Keypair) => signSubjectToken(k, {}, { expiresInSeconds: -120 }),
    ],
    [
      "a lifetime above the profile bound",
      (k: Keypair) => signSubjectToken(k, {}, { expiresInSeconds: 3600 }),
    ],
    ["no jti", (k: Keypair) => signSubjectToken(k, { jti: undefined })],
    [
      "an unknown user_id",
      (k: Keypair) => signSubjectToken(k, { sub: "email|nobody" }),
    ],
    ["a non-JWS subject token", async () => "not-a-jwt"],
  ])("rejects %s as invalid_request", async (_label, makeToken) => {
    const { oauthApp, env } = await getTestServer();
    const keypair = await generateKeypair();
    await seedClient(env);
    await seedJwtProfile(env, keypair);

    const { status, body } = await exchange(oauthApp, env, {
      subject_token: await makeToken(keypair),
    });

    expect(status).toBe(400);
    expect(body).toEqual({
      error: "invalid_request",
      error_description: "Invalid subject token",
    });
    expect(await logTypes(env)).toContain(
      LogTypes.FAILED_EXCHANGE_CUSTOM_TOKEN,
    );
  });

  it("rejects an HS256 token signed with a guessable secret", async () => {
    const { oauthApp, env } = await getTestServer();
    const keypair = await generateKeypair();
    await seedClient(env);
    await seedJwtProfile(env, keypair);

    const secret = new TextEncoder().encode(CLIENT_SECRET).buffer;
    const hsToken = await signJWT("HS256", secret, {
      iss: CUSTOMER_ISSUER,
      aud: ISSUER,
      sub: "email|userId",
      jti: "hs",
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    const { status, body } = await exchange(oauthApp, env, {
      subject_token: hsToken,
    });
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_request");
  });

  it("accepts each jti only once", async () => {
    const { oauthApp, env } = await getTestServer();
    const keypair = await generateKeypair();
    await seedClient(env);
    await seedJwtProfile(env, keypair);
    const subjectToken = await signSubjectToken(keypair);

    const first = await exchange(oauthApp, env, {
      subject_token: subjectToken,
    });
    const replay = await exchange(oauthApp, env, {
      subject_token: subjectToken,
    });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("invalid_request");
  });

  it("allows tokens without jti when the profile does not require it", async () => {
    const { oauthApp, env } = await getTestServer();
    const keypair = await generateKeypair();
    await seedClient(env);
    await seedJwtProfile(env, keypair, { require_jti: false });

    const { status } = await exchange(oauthApp, env, {
      subject_token: await signSubjectToken(keypair, { jti: undefined }),
    });
    expect(status).toBe(200);
  });

  it("rejects unknown subject token types", async () => {
    const { oauthApp, env } = await getTestServer();
    const keypair = await generateKeypair();
    await seedClient(env);
    await seedJwtProfile(env, keypair);

    const { status, body } = await exchange(oauthApp, env, {
      subject_token: await signSubjectToken(keypair),
      subject_token_type: "urn:acme:other",
    });
    expect(status).toBe(400);
    expect(body).toEqual({
      error: "invalid_request",
      error_description: "Unsupported subject_token_type",
    });
  });

  it("rejects clients without the Custom Token Exchange flag", async () => {
    const { oauthApp, env } = await getTestServer();
    const keypair = await generateKeypair();
    await seedClient(env, { enabled: false });
    await seedJwtProfile(env, keypair);

    const { status, body } = await exchange(oauthApp, env, {
      subject_token: await signSubjectToken(keypair),
    });
    expect(status).toBe(400);
    expect(body.error).toBe("unauthorized_client");
  });

  it("rejects third-party clients", async () => {
    const { oauthApp, env } = await getTestServer();
    const keypair = await generateKeypair();
    await seedClient(env, { is_first_party: false });
    await seedJwtProfile(env, keypair);

    const { status, body } = await exchange(oauthApp, env, {
      subject_token: await signSubjectToken(keypair),
    });
    expect(status).toBe(400);
    expect(body.error).toBe("unauthorized_client");
  });

  it("requires confidential clients to authenticate", async () => {
    const { oauthApp, env } = await getTestServer();
    const keypair = await generateKeypair();
    await seedClient(env);
    await seedJwtProfile(env, keypair);

    const { status, body } = await exchange(oauthApp, env, {
      subject_token: await signSubjectToken(keypair),
      client_secret: "wrong",
    });
    expect(status).toBe(401);
    expect(body.error).toBe("invalid_client");
  });

  it("lets public clients exchange without a secret", async () => {
    const { oauthApp, env } = await getTestServer();
    const keypair = await generateKeypair();
    await seedClient(env, { token_endpoint_auth_method: "none" });
    await seedJwtProfile(env, keypair);

    const response = await oauthApp.request(
      "/oauth/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "tenant-id": TENANT_ID,
        },
        body: new URLSearchParams({
          grant_type: TOKEN_EXCHANGE_GRANT,
          client_id: CLIENT_ID,
          subject_token_type: SUBJECT_TOKEN_TYPE,
          subject_token: await signSubjectToken(keypair),
        }).toString(),
      },
      env,
    );
    expect(response.status).toBe(200);
  });

  it("answers 429 once invalid subject tokens exceed the rate limit", async () => {
    const consumed: string[] = [];
    const rateLimit: RateLimitAdapter = {
      async consume(scope, key) {
        consumed.push(`${scope}:${key}`);
        return { allowed: false, retryAfterSeconds: 30 };
      },
    };
    const { oauthApp, env } = await getTestServer({ rateLimit });
    const keypair = await generateKeypair();
    await seedClient(env);
    await seedJwtProfile(env, keypair);

    const { status } = await exchange(oauthApp, env, {
      subject_token: await signSubjectToken(keypair, { iss: "https://evil" }),
    });
    expect(status).toBe(429);
    expect(consumed).toHaveLength(1);
    expect(consumed[0]).toMatch(/^brute-force:custom-token-exchange:tenantId:/);
  });

  it("does not count successful exchanges against the rate limit", async () => {
    const consumed: string[] = [];
    const rateLimit: RateLimitAdapter = {
      async consume(scope, key) {
        consumed.push(`${scope}:${key}`);
        return { allowed: false };
      },
    };
    const { oauthApp, env } = await getTestServer({ rateLimit });
    const keypair = await generateKeypair();
    await seedClient(env);
    await seedJwtProfile(env, keypair);

    const { status } = await exchange(oauthApp, env, {
      subject_token: await signSubjectToken(keypair),
    });
    expect(status).toBe(200);
    expect(consumed.filter((c) => c.includes("custom-token-exchange"))).toEqual(
      [],
    );
  });

  describe("connection user mapping", () => {
    it("creates <strategy>|<sub> users without trusting email_verified", async () => {
      const { oauthApp, env } = await getTestServer();
      const keypair = await generateKeypair();
      await seedClient(env);
      await seedJwtProfile(env, keypair, {
        user_mapping: {
          type: "connection",
          connection: "Username-Password-Authentication",
          create_if_not_exists: true,
        },
      });

      const { status, body } = await exchange(oauthApp, env, {
        subject_token: await signSubjectToken(keypair, {
          sub: "acme-42",
          email: "new.person@acme.test",
          email_verified: true,
          name: "New Person",
        }),
      });

      expect(status).toBe(200);
      expect(parseJWT(body.access_token!)?.payload.sub).toBe("auth2|acme-42");
      const user = await env.data.users.get(TENANT_ID, "auth2|acme-42");
      expect(user).toMatchObject({
        email: "new.person@acme.test",
        email_verified: false,
        name: "New Person",
        connection: "Username-Password-Authentication",
        provider: "auth2",
      });
    });

    it("copies email_verified when the profile trusts it", async () => {
      const { oauthApp, env } = await getTestServer();
      const keypair = await generateKeypair();
      await seedClient(env);
      await seedJwtProfile(env, keypair, {
        user_mapping: {
          type: "connection",
          connection: "Username-Password-Authentication",
          create_if_not_exists: true,
          trust_email_verified: true,
        },
      });

      const { status } = await exchange(oauthApp, env, {
        subject_token: await signSubjectToken(keypair, {
          sub: "acme-43",
          email: "verified@acme.test",
          email_verified: true,
        }),
      });

      expect(status).toBe(200);
      const user = await env.data.users.get(TENANT_ID, "auth2|acme-43");
      expect(user?.email_verified).toBe(true);
    });

    it("reuses the existing user on the next exchange", async () => {
      const { oauthApp, env } = await getTestServer();
      const keypair = await generateKeypair();
      await seedClient(env);
      await seedJwtProfile(env, keypair, {
        user_mapping: {
          type: "connection",
          connection: "Username-Password-Authentication",
          create_if_not_exists: true,
        },
      });

      for (let i = 0; i < 2; i++) {
        const { status } = await exchange(oauthApp, env, {
          subject_token: await signSubjectToken(keypair, { sub: "acme-44" }),
        });
        expect(status).toBe(200);
      }
      const { users } = await env.data.users.list(TENANT_ID, {
        q: "user_id:auth2|acme-44",
      });
      expect(users).toHaveLength(1);
    });

    it("rejects unknown users when creation is off", async () => {
      const { oauthApp, env } = await getTestServer();
      const keypair = await generateKeypair();
      await seedClient(env);
      await seedJwtProfile(env, keypair, {
        user_mapping: {
          type: "connection",
          connection: "Username-Password-Authentication",
          create_if_not_exists: false,
        },
      });

      const { status, body } = await exchange(oauthApp, env, {
        subject_token: await signSubjectToken(keypair, { sub: "acme-45" }),
      });
      expect(status).toBe(400);
      expect(body.error).toBe("invalid_request");
      expect(await env.data.users.get(TENANT_ID, "auth2|acme-45")).toBeNull();
    });
  });
});

describe("custom token exchange with an action profile", () => {
  async function setup(code: string) {
    const server = await getTestServer({
      codeExecutor: new LocalCodeExecutor(),
    });
    const { env } = server;
    await seedClient(env);
    const action = await env.data.actions.create(TENANT_ID, {
      name: "acme-exchange",
      code,
      supported_triggers: [{ id: "custom-token-exchange", version: "v1" }],
    });
    const profiles = env.data.tokenExchangeProfiles;
    if (!profiles) throw new Error("tokenExchangeProfiles adapter missing");
    await profiles.create(TENANT_ID, {
      name: "Acme via action",
      subject_token_type: SUBJECT_TOKEN_TYPE,
      type: "custom_authentication",
      action_id: action.id,
    });
    return server;
  }

  it("issues tokens for the user set by setUserById", async () => {
    const { oauthApp, env } = await setup(`
      exports.onExecuteCustomTokenExchange = async (event, api) => {
        if (event.transaction.subject_token !== "opaque-123") {
          api.access.rejectInvalidSubjectToken("unknown token");
          return;
        }
        api.authentication.setUserById("email|userId");
      };
    `);

    const { status, body } = await exchange(oauthApp, env, {
      subject_token: "opaque-123",
    });
    expect(status).toBe(200);
    expect(parseJWT(body.access_token!)?.payload.sub).toBe("email|userId");

    const { logs } = await env.data.logs.list(TENANT_ID, { per_page: 100 });
    const success = logs.find(
      (log) => log.type === LogTypes.SUCCESS_EXCHANGE_CUSTOM_TOKEN,
    );
    const executionId = success?.details?.execution_id;
    expect(typeof executionId).toBe("string");
    const execution = await env.data.actionExecutions.get(
      TENANT_ID,
      String(executionId),
    );
    expect(execution).toMatchObject({
      trigger_id: "custom-token-exchange",
      status: "final",
    });
  });

  it("creates users through setUserByConnection", async () => {
    const { oauthApp, env } = await setup(`
      exports.onExecuteCustomTokenExchange = async (event, api) => {
        api.authentication.setUserByConnection(
          "Username-Password-Authentication",
          { user_id: "ext-7", email: "ext7@acme.test", email_verified: true },
          { creationBehavior: "create_if_not_exists", updateBehavior: "none" },
        );
      };
    `);

    const { status, body } = await exchange(oauthApp, env, {
      subject_token: "anything",
    });
    expect(status).toBe(200);
    expect(parseJWT(body.access_token!)?.payload.sub).toBe("auth2|ext-7");
    const user = await env.data.users.get(TENANT_ID, "auth2|ext-7");
    expect(user?.email_verified).toBe(true);
  });

  it("maps rejectInvalidSubjectToken to invalid_request", async () => {
    const { oauthApp, env } = await setup(`
      exports.onExecuteCustomTokenExchange = async (event, api) => {
        api.access.rejectInvalidSubjectToken("bad signature");
      };
    `);

    const { status, body } = await exchange(oauthApp, env, {
      subject_token: "forged",
    });
    expect(status).toBe(400);
    expect(body).toEqual({
      error: "invalid_request",
      error_description: "Invalid subject token",
    });
  });

  it("passes api.access.deny through", async () => {
    const { oauthApp, env } = await setup(`
      exports.onExecuteCustomTokenExchange = async (event, api) => {
        api.access.deny("invalid_request", "account suspended");
      };
    `);

    const { status, body } = await exchange(oauthApp, env, {
      subject_token: "whatever",
    });
    expect(status).toBe(400);
    expect(body).toMatchObject({
      error: "invalid_request",
      error_description: "account suspended",
    });
  });

  it("fails when the action sets no user", async () => {
    const { oauthApp, env } = await setup(`
      exports.onExecuteCustomTokenExchange = async () => {};
    `);

    const { status, body } = await exchange(oauthApp, env, {
      subject_token: "whatever",
    });
    expect(status).toBe(400);
    expect(body.error_description).toBe(
      "The token exchange action did not set a user",
    );
  });
});

describe("standard token exchange routing", () => {
  it("still reports a missing organization for access_token subject tokens", async () => {
    const { oauthApp, env } = await getTestServer();
    await seedClient(env);

    const { status, body } = await exchange(oauthApp, env, {
      subject_token: "x",
      subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
    });
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(body.error_description).toContain("organization");
  });
});
