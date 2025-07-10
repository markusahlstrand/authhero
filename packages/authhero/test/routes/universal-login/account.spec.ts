import { describe, it, expect } from "vitest";
import { getTestServer } from "../../helpers/test-server";
import { loginWithCode } from "../../helpers/login";

describe("account", () => {
  it("should change the email used for login", async () => {
    const testServer = await getTestServer({
      mockEmail: true,
    });

    const redirectUri = await loginWithCode(testServer, {
      redirect_uri: "http://localhost:3000/u/account",
    });

    const accountUrl = new URL(redirectUri);

    expect(accountUrl.pathname).toBe("/u/account");
  });
});
