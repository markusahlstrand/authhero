import { describe, it, expect, vi, afterEach } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import {
  AuthorizationResponseType,
  Strategy,
} from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";
import { u2Screen } from "../helpers/u2-screen";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Bindings } from "../../src/types";

// Issue #1015 item 3: a password login must not reveal whether the account
// exists. Every scenario below targets the same identifier with the same
// guessed password, so any difference in the response is an existence leak.

const USERNAME = "victim@example.com";
const USER_ID = `${USERNAME_PASSWORD_PROVIDER}|victim`;
const CORRECT_PASSWORD = "CorrectPassword123!";
const GUESSED_PASSWORD = "Guess1234!";

type Scenario =
  | "unknown-user"
  | "wrong-password"
  | "dangling-linked-user"
  | "no-local-password";

const SCENARIOS: Scenario[] = [
  "unknown-user",
  "wrong-password",
  "dangling-linked-user",
  "no-local-password",
];

async function seed(env: Bindings, scenario: Scenario) {
  if (scenario === "unknown-user") {
    return;
  }

  await env.data.users.create("tenantId", {
    email: USERNAME,
    email_verified: true,
    name: "Victim",
    nickname: "victim",
    connection: Strategy.USERNAME_PASSWORD,
    provider: USERNAME_PASSWORD_PROVIDER,
    is_social: false,
    user_id: USER_ID,
    ...(scenario === "dangling-linked-user"
      ? { linked_to: `${USERNAME_PASSWORD_PROVIDER}|does-not-exist` }
      : {}),
  });

  if (scenario !== "no-local-password") {
    await env.data.passwords.create("tenantId", {
      user_id: USER_ID,
      password: await bcryptjs.hash(CORRECT_PASSWORD, 10),
      algorithm: "bcrypt",
    });
  }
}

async function startLogin(
  oauthApp: Awaited<ReturnType<typeof getTestServer>>["oauthApp"],
  env: Bindings,
): Promise<string> {
  const oauthClient = testClient(oauthApp, env);
  const authorizeResponse = await oauthClient.authorize.$get({
    query: {
      client_id: "clientId",
      redirect_uri: "https://example.com/callback",
      state: "state",
      nonce: "nonce",
      scope: "openid email profile",
      response_type: AuthorizationResponseType.CODE,
    },
  });
  expect(authorizeResponse.status).toBe(302);

  const location = authorizeResponse.headers.get("location");
  const state = new URL(`https://example.com${location}`).searchParams.get(
    "state",
  );
  if (!state) {
    throw new Error("No state found");
  }
  return state;
}

// The login state is a per-request id, and Stencil's SSR hydration markers
// (`s-id`, `c-id`, `<!--t.1.2.3-->`) count renders within the process. Strip
// both so pages rendered for different login sessions compare byte for byte.
function normalize(body: string, state: string) {
  return body
    .split(state)
    .join("<state>")
    .replace(/ s-id="\d+"/g, "")
    .replace(/ c-id="[\d.]+"/g, "")
    .replace(/<!--[a-z]\.[\d.]+-->/g, "");
}

async function setSessionUsername(env: Bindings, state: string) {
  const loginSession = await env.data.loginSessions.get("tenantId", state);
  if (!loginSession) {
    throw new Error("Login session not found");
  }
  loginSession.authParams.username = USERNAME;
  await env.data.loginSessions.update("tenantId", state, loginSession);
}

async function collect(
  attempt: (scenario: Scenario) => Promise<{ status: number; body: string }>,
) {
  const results: Record<string, { status: number; body: string }> = {};
  for (const scenario of SCENARIOS) {
    results[scenario] = await attempt(scenario);
  }
  return results;
}

function expectIdentical(
  results: Record<string, { status: number; body: string }>,
) {
  const reference = results["wrong-password"];
  for (const scenario of SCENARIOS) {
    expect(results[scenario], scenario).toEqual(reference);
  }
}

describe("password login - account enumeration", () => {
  it("/co/authenticate answers identically for every failure", async () => {
    const results = await collect(async (scenario) => {
      const { oauthApp, env } = await getTestServer();
      await seed(env, scenario);
      const response = await testClient(oauthApp, env).co.authenticate.$post({
        json: {
          client_id: "clientId",
          credential_type: "http://auth0.com/oauth/grant-type/password-realm",
          realm: Strategy.USERNAME_PASSWORD,
          password: GUESSED_PASSWORD,
          username: USERNAME,
        },
      });
      return {
        status: response.status,
        body: `${response.headers.get("content-type")}\n${await response.text()}`,
      };
    });

    expectIdentical(results);
    expect(results["unknown-user"]).toEqual({
      status: 403,
      body: "text/plain;charset=UTF-8\nWrong email or password.",
    });
  });

  it("keeps the fu/fp distinction in the tenant logs", async () => {
    const logTypes: Record<string, string[]> = {};
    for (const scenario of ["unknown-user", "wrong-password"] as const) {
      const { oauthApp, env } = await getTestServer();
      await seed(env, scenario);
      await testClient(oauthApp, env).co.authenticate.$post({
        json: {
          client_id: "clientId",
          credential_type: "http://auth0.com/oauth/grant-type/password-realm",
          realm: Strategy.USERNAME_PASSWORD,
          password: GUESSED_PASSWORD,
          username: USERNAME,
        },
      });
      const { logs } = await env.data.logs.list("tenantId");
      logTypes[scenario] = logs.map((log) => log.type).sort();
    }

    expect(logTypes["unknown-user"]).toEqual(["fcoa", "fu"]);
    expect(logTypes["wrong-password"]).toEqual(["fcoa", "fp"]);
  });

  it("u2 combined login screen renders identically for every failure", async () => {
    const results = await collect(async (scenario) => {
      const { u2App, oauthApp, env } = await getTestServer({
        testTenantLanguage: "en",
      });
      await seed(env, scenario);
      // The combined login screen only offers a password field when the
      // connection's strategy is the username-password one.
      await env.data.connections.update(
        "tenantId",
        Strategy.USERNAME_PASSWORD,
        { strategy: Strategy.USERNAME_PASSWORD },
      );
      const state = await startLogin(oauthApp, env);
      const response = await u2Screen(u2App, env, "login").$post({
        query: { state },
        form: { username: USERNAME, password: GUESSED_PASSWORD },
      });
      return {
        status: response.status,
        body: normalize(await response.text(), state),
      };
    });

    expectIdentical(results);
    expect(results["unknown-user"]?.body).toContain(
      "Wrong username or password",
    );
  });

  it("u2 enter-password screen renders identically for every failure", async () => {
    const results = await collect(async (scenario) => {
      const { u2App, oauthApp, env } = await getTestServer({
        testTenantLanguage: "en",
      });
      await seed(env, scenario);
      const state = await startLogin(oauthApp, env);
      await setSessionUsername(env, state);
      const response = await u2Screen(u2App, env, "enter-password").$post({
        query: { state },
        form: { password: GUESSED_PASSWORD },
      });
      return {
        status: response.status,
        body: normalize(await response.text(), state),
      };
    });

    expectIdentical(results);
    expect(results["unknown-user"]?.body).toContain("Wrong password");
  });

  it("classic /u enter-password renders identically for every failure", async () => {
    const results = await collect(async (scenario) => {
      const { universalApp, oauthApp, env } = await getTestServer({
        testTenantLanguage: "en",
      });
      await seed(env, scenario);
      const state = await startLogin(oauthApp, env);
      await setSessionUsername(env, state);
      const response = await testClient(universalApp, env)[
        "enter-password"
      ].$post({
        query: { state },
        form: { password: GUESSED_PASSWORD },
      });
      return {
        status: response.status,
        body: normalize(await response.text(), state),
      };
    });

    expectIdentical(results);
    expect(results["unknown-user"]?.status).toBe(400);
    expect(results["unknown-user"]?.body).toContain("Invalid password");
  });
});

describe("password login - timing equalization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function attempt(scenario: Scenario, password: string) {
    const { oauthApp, env } = await getTestServer();
    await seed(env, scenario);
    const compareSpy = vi.spyOn(bcryptjs, "compare");
    const response = await testClient(oauthApp, env).co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password,
        username: USERNAME,
      },
    });
    const calls = compareSpy.mock.calls.map(([candidate, hash]) => ({
      candidate,
      hash,
    }));
    compareSpy.mockRestore();
    return { status: response.status, calls };
  }

  it.each([
    "unknown-user",
    "dangling-linked-user",
    "no-local-password",
  ] as const)(
    "runs one bcrypt compare at the real cost factor for %s",
    async (scenario) => {
      const { status, calls } = await attempt(scenario, GUESSED_PASSWORD);

      expect(status).toBe(403);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.candidate).toBe(GUESSED_PASSWORD);
      const hash = calls[0]?.hash;
      if (typeof hash !== "string") {
        throw new Error("compare was not called with a hash");
      }
      expect(bcryptjs.getRounds(hash)).toBe(10);
    },
  );

  it("reuses the same dummy hash across requests", async () => {
    const first = await attempt("unknown-user", GUESSED_PASSWORD);
    const second = await attempt("unknown-user", "AnotherGuess1!");

    expect(first.calls[0]?.hash).toBeTypeOf("string");
    expect(second.calls[0]?.hash).toBe(first.calls[0]?.hash);
  });

  it("answers the same when the dummy compare itself fails", async () => {
    const { oauthApp, env } = await getTestServer();
    vi.spyOn(bcryptjs, "compare").mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await testClient(oauthApp, env).co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: GUESSED_PASSWORD,
        username: USERNAME,
      },
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Wrong email or password.");
  });

  it("does one real compare for a wrong password and still logs in with the right one", async () => {
    const wrong = await attempt("wrong-password", GUESSED_PASSWORD);
    expect(wrong.status).toBe(403);
    expect(wrong.calls).toHaveLength(1);

    const right = await attempt("wrong-password", CORRECT_PASSWORD);
    expect(right.status).toBe(200);
    expect(right.calls).toHaveLength(1);
    expect(right.calls[0]?.candidate).toBe(CORRECT_PASSWORD);
  });
});
