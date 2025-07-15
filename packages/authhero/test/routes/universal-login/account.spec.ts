import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { loginWithCode } from "../../helpers/login";

describe("account", () => {
  it("should change the email used for login", async () => {
    const testServer = await getTestServer({
      mockEmail: true,
    });

    const { universalApp, env } = testServer;
    const universalClient = testClient(universalApp, env);

    const { cookieName, cookieValue } = await loginWithCode(testServer, {
      redirect_uri: "http://localhost:3000/u/account",
    });

    const accountResponse = await universalClient["account"].$get(
      {
        query: { client_id: "clientId" },
      },
      {
        headers: {
          cookie: `${cookieName}=${cookieValue}`,
        },
      },
    );

    expect(accountResponse.status).toBe(200);
    const accountPage = await accountResponse.text();
    expect(accountPage).toContain("foo@example.com");

    // ---------------------------------
    // Change email
    // ---------------------------------
    const changeEmailResponse = await universalClient["account"].$post(
      {
        query: { client_id: "clientId" },
        form: {
          action: "update_email",
          email: "foo2@example.com",
        },
      },
      {
        headers: {
          cookie: `${cookieName}=${cookieValue}`,
        },
      },
    );

    expect(changeEmailResponse.status).toBe(200);
    const changeEmailPage = await changeEmailResponse.text();
    expect(changeEmailPage).toContain("foo2@example.com");

    const updatedUser = await env.data.users.get("tenantId", "email|userId");
    if (!updatedUser) {
      throw new Error("User not found");
    }
    expect(updatedUser.email).toBe("foo2@example.com");
  });
});
